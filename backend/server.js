
require('dotenv').config();
const cors = require('cors');
const express = require('express');
const nodemailer = require('nodemailer');
const rateLimit = require('express-rate-limit');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const { z } = require('zod');

const app = express();


app.use(cors());
app.use(express.json());

let leads = []; // mock DB

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 50 });
app.use(limiter);

const schema = z.object({
  nome: z.string().min(2),
  email: z.string().email(),
  mensagem: z.string().min(5),
  website: z.string().optional()
});

app.post('/send', async (req, res) => {
  try {
    const data = schema.parse(req.body);

    if (data.website) {
      console.log('🚨 Spam detectado');
      return res.status(400).json({ error: 'Spam detectado' });
    }

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_TO,
      subject: 'Novo Lead 🚀',
      html: `
        <h2>Novo Lead</h2>
        <p><strong>Nome:</strong> ${data.nome}</p>
        <p><strong>Email:</strong> ${data.email}</p>
        <p><strong>Mensagem:</strong> ${data.mensagem}</p>
      `,
    };

    const response = await transporter.sendMail(mailOptions);

    console.log('📩 EMAIL ENVIADO:', response);
    console.log('📨 DADOS:', data);

    res.json({ success: true });

  } catch (err) {
    console.error('❌ ERRO:', err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(3000, () => console.log('SaaS rodando na porta 3000'));
