import { useState } from "react";

function App() {
  const [memoryText, setMemoryText] = useState("");
  const [question, setQuestion] = useState("");
  const [response, setResponse] = useState("");

  async function remember() {
    const result = await fetch(
      "http://localhost:8000/remember",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: memoryText,
        }),
      }
    );

    const data = await result.json();

    setResponse(
      `Remembered: ${JSON.stringify(data)}`
    );

    setMemoryText("");
  }

  async function ask() {
    const result = await fetch(
      `http://localhost:8000/ask?question=${encodeURIComponent(question)}`
    );

    const data = await result.json();

    setResponse(data.answer);
  }

  return (
    <div className="container">
      <h1>Marlow</h1>

      <h2>Tell Marlow</h2>

      <textarea
        placeholder="Something you want Marlow to remember..."
        value={memoryText}
        onChange={(e) =>
          setMemoryText(e.target.value)
        }
      />

      <button onClick={remember}>
        Remember
      </button>


      <h2>Ask Marlow</h2>

      <textarea
        placeholder="What do you need to know?"
        value={question}
        onChange={(e) =>
          setQuestion(e.target.value)
        }
      />

      <button onClick={ask}>
        Ask
      </button>


      <div className="response">
        {response}
      </div>
    </div>
  );
}

export default App;