import { createRoot } from "react-dom/client";
import { usePartySocket } from "partysocket/react";
import React, { useState, useEffect } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useParams,
} from "react-router";
import { nanoid } from "nanoid";

import {
  names,
  type ChatMessage,
  type Message,
  type TodoItem,
  type Prompt,
  type PartnerNote,
  type PartnerContent,
  type PRIQuestion,
} from "../shared";

function App() {
  const [name] = useState(names[Math.floor(Math.random() * names.length)]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const { room } = useParams();

  const socket = usePartySocket({
    party: "chat",
    room,
    onMessage: (evt) => {
      const message = JSON.parse(evt.data as string) as Message;
      if (message.type === "add") {
        const foundIndex = messages.findIndex((m) => m.id === message.id);
        if (foundIndex === -1) {
          // probably someone else who added a message
          setMessages((messages) => [
            ...messages,
            {
              id: message.id,
              content: message.content,
              user: message.user,
              role: message.role,
            },
          ]);
        } else {
          // this usually means we ourselves added a message
          // and it was broadcasted back
          // so let's replace the message with the new message
          setMessages((messages) => {
            return messages
              .slice(0, foundIndex)
              .concat({
                id: message.id,
                content: message.content,
                user: message.user,
                role: message.role,
              })
              .concat(messages.slice(foundIndex + 1));
          });
        }
      } else if (message.type === "update") {
        setMessages((messages) =>
          messages.map((m) =>
            m.id === message.id
              ? {
                  id: message.id,
                  content: message.content,
                  user: message.user,
                  role: message.role,
                }
              : m,
          ),
        );
      } else {
        setMessages(message.messages);
      }
    },
  });

  return (
    <div className="chat container">
      {messages.map((message) => (
        <div key={message.id} className="row message">
          <div className="two columns user">{message.user}</div>
          <div className="ten columns">{message.content}</div>
        </div>
      ))}
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          const content = e.currentTarget.elements.namedItem(
            "content",
          ) as HTMLInputElement;
          const chatMessage: ChatMessage = {
            id: nanoid(8),
            content: content.value,
            user: name,
            role: "user",
          };
          setMessages((messages) => [...messages, chatMessage]);
          // we could broadcast the message here

          socket.send(
            JSON.stringify({
              type: "add",
              ...chatMessage,
            } satisfies Message),
          );

          content.value = "";
        }}
      >
        <input
          type="text"
          name="content"
          className="ten columns my-input-text"
          placeholder={`Hello ${name}! Type a message...`}
          autoComplete="off"
        />
        <button type="submit" className="send-message two columns">
          Send
        </button>
      </form>
    </div>
  );
}

function TandemApp() {
  const { name } = useParams();
  const partner = new URLSearchParams(window.location.search).get("partner") ||
    "default";
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [notes, setNotes] = useState<PartnerNote[]>([]);
  const [content, setContent] = useState<PartnerContent[]>([]);
  const [questions, setQuestions] = useState<PRIQuestion[]>([]);
  const [priScore, setPriScore] = useState<number>(0);

  async function refresh() {
    const todoRes = await fetch(`/parties/tandem/${name}/todos`);
    const todosData = await todoRes.json();
    setTodos(todosData.todos as TodoItem[]);
    const promptRes = await fetch(`/parties/tandem/${name}/prompts`);
    const promptData = await promptRes.json();
    setPrompts(promptData.prompts as Prompt[]);
    const noteRes = await fetch(
      `/parties/tandem/${name}/notes?partner=${partner}`,
    );
    const noteData = await noteRes.json();
    setNotes(noteData.notes as PartnerNote[]);
    const contentRes = await fetch(
      `/parties/tandem/${name}/content?partner=${partner}`,
    );
    const contentData = await contentRes.json();
    setContent(contentData.content as PartnerContent[]);
    const qRes = await fetch(`/parties/tandem/${name}/pri/questions`);
    const qData = await qRes.json();
    setQuestions(qData.questions as PRIQuestion[]);
    const scoreRes = await fetch(`/parties/tandem/${name}/pri?partner=${partner}`);
    const scoreData = await scoreRes.json();
    setPriScore(scoreData.score as number);
  }

  useEffect(() => {
    refresh();
  }, [name, partner]);

  async function addTodo(content: string) {
    const res = await fetch(`/parties/tandem/${name}/todos`, {
      method: "POST",
      body: JSON.stringify({ content }),
    });
    const item = (await res.json()) as TodoItem;
    setTodos((t) => [...t, item]);
  }

  async function toggleTodo(t: TodoItem) {
    const res = await fetch(`/parties/tandem/${name}/todos/${t.id}`, {
      method: "PUT",
      body: JSON.stringify({ completed: !t.completed }),
    });
    const item = (await res.json()) as TodoItem;
    setTodos((tds) => tds.map((todo) => (todo.id === item.id ? item : todo)));
  }

  async function addNote(text: string) {
    const res = await fetch(
      `/parties/tandem/${name}/notes?partner=${partner}`,
      {
        method: "POST",
        body: JSON.stringify({ text }),
      },
    );
    const note = (await res.json()) as PartnerNote;
    setNotes((n) => [...n, note]);
  }

  async function answerQuestion(questionId: string, score: number) {
    await fetch(`/parties/tandem/${name}/pri?partner=${partner}`, {
      method: "POST",
      body: JSON.stringify({ questionId, score }),
    });
    const updated = await (
      await fetch(`/parties/tandem/${name}/pri?partner=${partner}`)
    ).json();
    setPriScore(updated.score as number);
  }

  return (
    <div className="container" style={{ marginTop: "2rem" }}>
      <h4>Todos</h4>
      <ul>
        {todos.map((t) => (
          <li key={t.id}>
            <label>
              <input
                type="checkbox"
                checked={t.completed}
                onChange={() => toggleTodo(t)}
              />
              {" "}
              {t.content}
            </label>
          </li>
        ))}
      </ul>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const input = e.currentTarget.elements.namedItem(
            "todo",
          ) as HTMLInputElement;
          if (input.value.trim()) {
            addTodo(input.value.trim());
            input.value = "";
          }
        }}
      >
        <input type="text" name="todo" placeholder="Add a todo" />
        <button type="submit">Add</button>
      </form>
      <h4 style={{ marginTop: "2rem" }}>Discussion Prompts</h4>
      <ul>
        {prompts.map((p) => (
          <li key={p.id}>{p.text}</li>
        ))}
      </ul>
      <h4 style={{ marginTop: "2rem" }}>Notes for {partner}</h4>
      <ul>
        {notes.map((n) => (
          <li key={n.id}>{n.text}</li>
        ))}
      </ul>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const input = e.currentTarget.elements.namedItem(
            "note",
          ) as HTMLInputElement;
          if (input.value.trim()) {
            addNote(input.value.trim());
            input.value = "";
          }
        }}
      >
        <input type="text" name="note" placeholder="Add a note" />
        <button type="submit">Add</button>
      </form>
      <h4 style={{ marginTop: "2rem" }}>Readiness Score: {priScore}</h4>
      <ul>
        {questions.map((q) => (
          <li key={q.id}>
            {q.text}
            {[1, 2, 3, 4, 5].map((v) => (
              <label key={v} style={{ marginLeft: "0.5rem" }}>
                <input
                  type="radio"
                  name={`q-${q.id}`}
                  value={v}
                  onChange={() => answerQuestion(q.id, v)}
                />
                {v}
              </label>
            ))}
          </li>
        ))}
      </ul>
      <h4 style={{ marginTop: "2rem" }}>Content for {partner}</h4>
      <ul>
        {content.map((c) => (
          <li key={c.id}>{c.text}</li>
        ))}
      </ul>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<Navigate to={`/chat/${nanoid()}`} />} />
      <Route path="/chat/:room" element={<App />} />
      <Route path="/tandem/:name" element={<TandemApp />} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  </BrowserRouter>,
);
