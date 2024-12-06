import React, { useState, useEffect } from "react";
import io from "socket.io-client";
import axios from "axios";

const SERVER_URL = "https://server.filmutunnel.site";
const socket = io(SERVER_URL);

function App() {
  const [username, setUsername] = useState("");
  const [roomId, setRoomId] = useState("");
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const [file, setFile] = useState(null);
  const [users, setUsers] = useState([]);
  const [globalUsers, setGlobalUsers] = useState(0);
  const [joinedRoom, setJoinedRoom] = useState(false);


  // Join room
  const joinRoom = () => {
    if (username && roomId) {
      socket.emit("join-room", { roomId, username });
      setJoinedRoom(true)
    }
  };

  // Send message
  const sendMessage = () => {
    if (message) {
      const timestamp = new Date().toLocaleTimeString();
      socket.emit("send-message", { roomId, message, sender: username, timestamp });
      setMessage("");
    }
  };

  // File upload
  const uploadFile = async () => {
    if (file) {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("roomId", roomId);
  
      try {
        // Upload the file and get the file URL
        const response = await axios.post(`${SERVER_URL}/upload`, formData);
        const fileUrl = response.data.filePath; // Assuming the server responds with { filePath: "url" }
  
        // Automatically send the file link as a message
        const timestamp = new Date().toLocaleTimeString();
        socket.emit("send-message", {
          roomId,
          message: fileUrl, // The file link is sent directly as a message
          sender: username,
          timestamp,
        });
  
        setFile(null); // Clear the selected file
      } catch (err) {
        console.error("Error uploading file:", err);
      }
    }
  };
  

  // Listen for messages and user updates
  useEffect(() => {
    socket.on("receive-message", (msg) => {
      setMessages((prev) => [...prev, msg]);
    });

    socket.on("update-global-users", (count) => {
      console.log("Global Users:", count);
      setGlobalUsers(count); // Function to update UI
    });
    
    
    socket.on("previous-messages", (msgs) => {
      setMessages(msgs);
    });

    socket.on("update-users", (roomUsers) => {
      setUsers(roomUsers);
    });

    return () => {
      socket.off("receive-message");
      socket.off("previous-messages");
      socket.off("update-users");
    };
  }, []);

  return (
    <div style={styles.container}>
      <h1>Kouma</h1>
      <div style={styles.form}>
        <input
          type="text"
          placeholder="Enter your name"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          style={styles.input}
        />
        <input
          type="text"
          placeholder="Enter room ID"
          value={roomId}
          onChange={(e) => setRoomId(e.target.value)}
          style={styles.input}
        />
        <button onClick={joinRoom} style={styles.button}>
          Join Room
        </button>
      </div>

      <div style={styles.usersBox}>
  <h3>Global Users Online: {globalUsers}</h3>
  <h3>Connected Users in Room:</h3>
  <ul>
    {users.map((user, idx) => (
      <li key={idx}>{user}</li>
    ))}
  </ul>
</div>


<div style={styles.chatBox}>
  {messages.map((msg, idx) => (
    <div key={idx} style={styles.message}>
      <strong>{msg.sender}:</strong>{" "}
      {msg.message.startsWith("http") ? ( // Detect URLs
        <a href={msg.message} target="_blank" rel="noopener noreferrer">
          {msg.message}
        </a>
      ) : (
        msg.message
      )}{" "}
      <em>({msg.timestamp})</em>
    </div>
  ))}
</div>

{username&&joinedRoom&&<div><div style={styles.form}>
  <input
    type="text"
    placeholder="Enter message"
    value={message}
    onChange={(e) => setMessage(e.target.value)}
    onKeyDown={(e) => e.key === 'Enter' && sendMessage()} // Trigger send on Enter
    style={styles.input}
  />
  <button onClick={sendMessage} style={styles.button}>
    Send
  </button>
</div>


      <div style={styles.form}>
        <input type="file" onChange={(e) => setFile(e.target.files[0])} style={styles.input} />
        <button onClick={uploadFile} style={styles.button}>
          Upload File
        </button>
      </div></div>}
    </div>
  );
}

const styles = {
  container: { padding: "20px", fontFamily: "Arial, sans-serif" },
  form: { margin: "10px 0" },
  input: { padding: "10px", marginRight: "10px", width: "200px" },
  button: { padding: "10px 20px", cursor: "pointer" },
  chatBox: { border: "1px solid #ddd", padding: "10px", height: "300px", overflowY: "auto" },
  message: { margin: "5px 0" },
  usersBox: { margin: "20px 0", padding: "10px", border: "1px solid #ddd" },
};

export default App;
