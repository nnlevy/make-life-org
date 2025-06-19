import {
  type Connection,
  Server,
  type WSMessage,
  routePartykitRequest,
} from "partyserver";

import { nanoid } from "nanoid";
import type { ChatMessage, Message, TodoItem, Prompt } from "../shared";

export class Chat extends Server<Env> {
  static options = { hibernate: true };

  messages = [] as ChatMessage[];

  broadcastMessage(message: Message, exclude?: string[]) {
    this.broadcast(JSON.stringify(message), exclude);
  }

  onStart() {
    // this is where you can initialize things that need to be done before the server starts
    // for example, load previous messages from a database or a service

    // create the messages table if it doesn't exist
    this.ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, user TEXT, role TEXT, content TEXT)`,
    );

    // load the messages from the database
    this.messages = this.ctx.storage.sql
      .exec(`SELECT * FROM messages`)
      .toArray() as ChatMessage[];
  }

  onConnect(connection: Connection) {
    connection.send(
      JSON.stringify({
        type: "all",
        messages: this.messages,
      } satisfies Message),
    );
  }

  saveMessage(message: ChatMessage) {
    // check if the message already exists
    const existingMessage = this.messages.find((m) => m.id === message.id);
    if (existingMessage) {
      this.messages = this.messages.map((m) => {
        if (m.id === message.id) {
          return message;
        }
        return m;
      });
    } else {
      this.messages.push(message);
    }

    this.ctx.storage.sql.exec(
      `INSERT INTO messages (id, user, role, content) VALUES ('${
        message.id
      }', '${message.user}', '${message.role}', ${JSON.stringify(
        message.content,
      )}) ON CONFLICT (id) DO UPDATE SET content = ${JSON.stringify(
        message.content,
      )}`,
    );
  }

  onMessage(connection: Connection, message: WSMessage) {
    // let's broadcast the raw message to everyone else
    this.broadcast(message);

    // let's update our local messages store
    const parsed = JSON.parse(message as string) as Message;
    if (parsed.type === "add" || parsed.type === "update") {
      this.saveMessage(parsed);
    }
  }
}

export class Tandem extends Server<Env> {
  static options = { hibernate: true };

  todos: TodoItem[] = [];
  prompts: Prompt[] = [
    { id: "finances", text: "Discuss your finances." },
    { id: "childcare", text: "Plan division of childcare." },
    { id: "career", text: "Share your career plans." },
  ];

  onStart() {
    this.ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS todos (id TEXT PRIMARY KEY, content TEXT, completed INTEGER)`,
    );
    this.ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS prompts (id TEXT PRIMARY KEY, text TEXT)`,
    );
    this.todos = this.ctx.storage.sql
      .exec(`SELECT * FROM todos`)
      .toArray() as unknown as TodoItem[];
    const savedPrompts = this.ctx.storage.sql
      .exec(`SELECT * FROM prompts`)
      .toArray() as unknown as Prompt[];
    if (savedPrompts.length === 0) {
      for (const p of this.prompts) {
        this.ctx.storage.sql.exec(
          `INSERT INTO prompts (id, text) VALUES ('${p.id}', ${JSON.stringify(p.text)})`,
        );
      }
    } else {
      this.prompts = savedPrompts;
    }
  }

  async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean).slice(3);
    if (parts[0] === "todos") {
      if (request.method === "GET") {
        return Response.json({ todos: this.todos });
      }
      if (request.method === "POST") {
        const data: any = await request.json();
        const { content } = data;
        const item: TodoItem = { id: nanoid(8), content, completed: false };
        this.todos.push(item);
        this.ctx.storage.sql.exec(
          `INSERT INTO todos (id, content, completed) VALUES ('${item.id}', ${JSON.stringify(content)}, 0)`,
        );
        return Response.json(item);
      }
      const id = parts[1];
      if (!id) return new Response("Not Found", { status: 404 });
      const index = this.todos.findIndex((t) => t.id === id);
      if (index === -1) return new Response("Not Found", { status: 404 });
      if (request.method === "PUT") {
        const data: any = await request.json();
        if (data.content !== undefined) this.todos[index].content = data.content;
        if (data.completed !== undefined)
          this.todos[index].completed = !!data.completed;
        this.ctx.storage.sql.exec(
          `INSERT INTO todos (id, content, completed) VALUES ('${id}', ${JSON.stringify(
            this.todos[index].content,
          )}, ${this.todos[index].completed ? 1 : 0}) ON CONFLICT (id) DO UPDATE SET content = ${JSON.stringify(
            this.todos[index].content,
          )}, completed = ${this.todos[index].completed ? 1 : 0}`,
        );
        return Response.json(this.todos[index]);
      }
      if (request.method === "DELETE") {
        this.todos.splice(index, 1);
        this.ctx.storage.sql.exec(`DELETE FROM todos WHERE id='${id}'`);
        return Response.json({ ok: true });
      }
    }
    if (parts[0] === "prompts" && request.method === "GET") {
      return Response.json({ prompts: this.prompts });
    }
    return new Response("Not Found", { status: 404 });
  }
}

export default {
  async fetch(request, env) {
    return (
      (await routePartykitRequest(request, { ...env })) ||
      env.ASSETS.fetch(request)
    );
  },
} satisfies ExportedHandler<Env>;
