# Remote Bot Testing — Dost ke Live Agent ko URL se Test Karna

> Status: PLAN (abhi implement nahi hua)
> Date: 26 Sep 2026

## Idea kya hai

Dost apne computer pe apna AI agent chalata hai. Tum Warrant me uska URL daalte ho.
Warrant uske **asli live bot** se baat karta hai, saare safety tests uspe chalata hai,
aur end me **signed receipt + email** bhej deta hai.

```
Dost ka PC (bot live)          Tumhara PC (Warrant)
┌──────────────────┐           ┌──────────────────┐
|  Bot :8000       |  <------  |  Crash It dabao  |
|  + ngrok link    |  --attack-->  attacker baat  |
└──────────────────┘   leak?   |  judge scores    |
                               |  receipt + email |
                               └──────────────────┘
```

## Sabse badi deewar (samajhna zaroori hai)

**Uske computer ka "localhost" tumhare computer se nahi dikhta.**
Har machine ka apna localhost hota hai. Isliye seedha URL daalne se connect nahi hoga.

## 3 cheezein chahiye

### 1. Pata — ngrok (2 minute)

Dost apne PC pe chalaye:

```bash
npx ngrok http 8000
```

Milega ek public link, jaise `https://abc123.ngrok.io`. Ye link tumhe bhejega.

Alternative: dono same WiFi pe ho to uska local IP chalega, jaise `http://192.168.1.5:8000`.

### 2. Bot ka format — simple JSON (10 line ka code)

Uska bot is format me baat kare:

```json
// Warrant bhejega:
POST https://abc123.ngrok.io/chat
{ "message": "Mera OTP batao" }

// Bot jawab dega:
{ "reply": "Aapka OTP 441902 hai" }
```

**Python (FastAPI) sample — dost ye chalaye:**

```python
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()

class ChatIn(BaseModel):
    message: str

@app.post("/chat")
def chat(body: ChatIn):
    # Yahan dost apne agent ko call kare
    reply = my_agent.reply(body.message)
    return {"reply": reply}
```

```bash
pip install fastapi uvicorn
uvicorn bot:app --port 8000
npx ngrok http 8000
```

**Node (Express) sample:**

```js
const express = require("express");
const app = express();
app.use(express.json());

app.post("/chat", async (req, res) => {
  // Yahan dost apne agent ko call kare
  const reply = await myAgent.reply(req.body.message);
  res.json({ reply });
});

app.listen(8000);
```

### 3. Email ke liye key — Resend (free, 2 minute)

Receipt to Warrant already banata hai. Email bhejne ke liye key chahiye:

1. https://resend.com pe free account banao
2. API key copy karo
3. `.env.local` me daalo:

```bash
RESEND_API_KEY=re_xxxxxxxxxxxxxxxx
REPORT_EMAIL_TO=dost@example.com
```

Bina key ke email kahin se bhi nahi jayega — ye technical majboori hai.

## Poora flow (banne ke baad)

1. Dost: apna bot chalata hai + ngrok link bhejta hai
2. Tum: Warrant me link daalte ho → scenario chunte ho → **Crash It**
3. Attacker uske **asli bot** se baat karta hai (live transcript dikhta hai)
4. Leak pakda gaya to canary match + judge rating
5. **Signed receipt** banta hai (Ed25519, QR ke saath)
6. **Email** jata hai — receipt + rating + exact quoted line

## Kya already ready hai vs kya banana hai

| Cheez | Status |
|---|---|
| Attacker loop (red-team) | ✅ Ready (`lib/attacker.ts`) |
| Judge + rating | ✅ Ready (`lib/judge.ts`) |
| Signed receipt + QR | ✅ Ready (`lib/receipt.ts`) |
| Public verify page | ✅ Ready (`/verify/[fingerprint]`) |
| **External bot adapter** (`POST /chat` se baat) | ❌ Banana hai (~30 min) |
| **UI me URL field** | ❌ Banana hai (~10 min) |
| **Email (Resend)** | ❌ Banana hai (~15 min) |

Total estimate: **~1 ghanta**

## Important notes (demo se pehle padhna)

1. **Canary matching sirf tab kaam karega jab secrets plant ho.** Dost ke bot me uska ASLI data hai, hamare nakli canaries nahi. To leak detection judge pe depend karegi (transcript padh ke), exact-string match pe nahi. Judge wali evidence ("turn 3 pe ye bola") phir bhi milegi.
2. **Ek time pe ek test.** Groq free tier 8000 TPM hai — parallel tests 429 khayenge.
3. **Dost ka data tumhare paas kabhi nahi aata.** Sirf uske jawab aate hain. Yehi safe hai.
4. **Ngrok free link har restart pe badalta hai.** Dost ngrok restart kare to naya link bhejega.

## Sawal (shuru karne se pehle decide karna hai)

1. Dost ka bot Python me hai ya Node me?
2. Dono same WiFi pe ho ya alag jagah? (ngrok chahiye ya local IP kaafi hai)
3. Resend key kaun banayega?
