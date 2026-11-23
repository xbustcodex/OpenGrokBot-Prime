/**
 * Multi-agent supervisor: native hand-off, shared blackboard, parallel subagents.
 * OpenCode (or any other backend) is used only as the model provider for each agent turn.
 */
import { v4 as uuid } from "uuid";
import { modelRouter } from "../backends/router.js";
import { memory } from "../memory/store.js";
import { approvalGate } from "../approval/gate.js";
import { browserSandbox } from "../browser/playwright.js";
import { mcpHub } from "../mcp/client.js";
import { DEFAULT_AGENTS } from "./agents.js";
import { AgentConfig, Message, Task } from "../types.js";

export class Supervisor {
  private agents: Map<string, AgentConfig>;
  private tasks = new Map<string, Task>();
  private conversation: Message[] = [];

  constructor(agents: AgentConfig[] = DEFAULT_AGENTS) {
    this.agents = new Map(agents.map((a) => [a.id, a]));
  }

  listAgents() {
    return [...this.agents.values()];
  }

  listTasks() {
    return [...this.tasks.values()];
  }

  getConversation() {
    return [...this.conversation];
  }

  async runUserMessage(text: string): Promise<{ reply: string; tasks: Task[] }> {
    const userMsg: Message = {
      id: uuid(),
      role: "user",
      content: text,
      timestamp: Date.now(),
    };
    this.conversation.push(userMsg);

    const plan = await this.agentTurn("supervisor", [
      {
        role: "system",
        content: this.agents.get("supervisor")!.systemPrompt,
      },
      {
        role: "user",
        content: `User request:\n${text}\n\nCurrent blackboard:\n${JSON.stringify(memory.getAllBlackboard(), null, 2)}\n\nRespond with a short plan and which agents to call (researcher, coder, browser, critic). Then produce the final answer if you can do it alone.`,
      },
    ]);

    const needResearch = /research|search|find|look up/i.test(plan + text);
    const needBrowser = /browse|website|url|page|web/i.test(plan + text);
    const needCode = /code|implement|fix|function|script/i.test(plan + text);

    const subResults: string[] = [];

    if (needResearch) {
      const r = await this.runSpecialist("researcher", text, plan);
      subResults.push(`[Researcher]\n${r}`);
    }
    if (needBrowser) {
      const r = await this.runSpecialist("browser", text, plan);
      subResults.push(`[Browser]\n${r}`);
    }
    if (needCode) {
      const r = await this.runSpecialist("coder", text, plan);
      subResults.push(`[Coder]\n${r}`);
    }

    if (subResults.length) {
      const critique = await this.agentTurn("critic", [
        {
          role: "system",
          content: this.agents.get("critic")!.systemPrompt,
        },
        {
          role: "user",
          content: `Original request: ${text}\n\nAgent outputs:\n${subResults.join("\n\n")}\n\nProvide a short critique and a refined final answer.`,
        },
      ]);
      subResults.push(`[Critic]\n${critique}`);
    }

    const final = await this.agentTurn("supervisor", [
      {
        role: "system",
        content: this.agents.get("supervisor")!.systemPrompt,
      },
      {
        role: "user",
        content: `User request: ${text}\n\nYour earlier plan:\n${plan}\n\nSpecialist results:\n${subResults.join("\n\n") || "(none)"}\n\nProduce the final answer for the user.`,
      },
    ]);

    const assistantMsg: Message = {
      id: uuid(),
      role: "assistant",
      content: final,
      agentId: "supervisor",
      timestamp: Date.now(),
    };
    this.conversation.push(assistantMsg);

    memory.upsertFact(
      `last_task_${Date.now()}`,
      text.slice(0, 200),
      "supervisor",
      0.9
    );

    return { reply: final, tasks: this.listTasks() };
  }

  private async runSpecialist(agentId: string, userText: string, plan: string): Promise<string> {
    const agent = this.agents.get(agentId);
    if (!agent) return `(no agent ${agentId})`;

    const task: Task = {
      id: uuid(),
      title: `${agent.name} task`,
      description: userText.slice(0, 300),
      status: "running",
      assignedTo: agentId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.tasks.set(task.id, task);

    try {
      let extraContext = "";

      if (agentId === "browser") {
        const urlMatch = userText.match(/https?:\/\/[^\s]+/);
        if (urlMatch) {
          try {
            const result = await browserSandbox.navigate(urlMatch[0]);
            extraContext = `\n\nBrowser result for ${result.url}:\nTitle: ${result.title}\n\n${result.text.slice(0, 4000)}`;
            memory.setBlackboard(`browser:${result.url}`, result, agentId);
          } catch (e: any) {
            extraContext = `\n\nBrowser error: ${e.message}`;
          }
        }
      }

      const result = await this.agentTurn(agentId, [
        { role: "system", content: agent.systemPrompt },
        {
          role: "user",
          content: `Task from supervisor:\n${plan}\n\nUser request:\n${userText}${extraContext}\n\nBlackboard:\n${JSON.stringify(memory.getAllBlackboard(), null, 2)}\n\nRespond with your findings or output. Write key facts to memory when useful.`,
        },
      ]);

      memory.setBlackboard(`result:${agentId}:${task.id}`, result, agentId);
      task.status = "done";
      task.result = result;
      task.updatedAt = Date.now();
      this.tasks.set(task.id, task);
      return result;
    } catch (e: any) {
      task.status = "failed";
      task.result = e.message;
      task.updatedAt = Date.now();
      this.tasks.set(task.id, task);
      return `Error: ${e.message}`;
    }
  }

  private async agentTurn(
    agentId: string,
    messages: { role: string; content: string }[]
  ): Promise<string> {
    const preferFree = agentId !== "supervisor";
    const res = await modelRouter.chat({
      messages,
      preferFree,
      temperature: 0.3,
      maxTokens: 2048,
    });
    return res.content || "(empty response)";
  }
}

export const supervisor = new Supervisor();
