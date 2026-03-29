require('dotenv').config();

const cors = require('cors');
const express = require('express');
const nodemailer = require('nodemailer');
const rateLimit = require('express-rate-limit');
const { z, ZodError } = require('zod');

const app = express();

app.use(cors());
app.use(express.json());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: {
    error: 'Muitas requisições. Tente novamente em alguns minutos.'
  }
});

app.use(limiter);

const schema = z.object({
  nome: z.string().min(2, 'O nome deve ter pelo menos 2 caracteres'),
  email: z.string().email('E-mail inválido'),
  empresa: z.string().min(2, 'A empresa deve ter pelo menos 2 caracteres'),
  telefone: z.string().optional().default(''),
  categoria: z.string().optional().default(''),
  mensagem: z.string().optional().default(''),
  website: z.string().optional().default('')
});

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

transporter.verify((error, success) => {
  if (error) {
    console.error('❌ Erro no transporter:', error.message);
  } else {
    console.log('✅ Transporter pronto para envio de e-mails');
  }
});

app.get('/', (req, res) => {
  res.status(200).send('Servidor online');
});

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime()
  });
});

app.post('/send', async (req, res) => {
  try {
    console.log('📥 Body recebido:', req.body);

    const data = schema.parse(req.body);

    if (data.website && data.website.trim() !== '') {
      console.log('🚨 Spam detectado via honeypot');
      return res.status(400).json({ error: 'Spam detectado' });
    }

    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS || !process.env.EMAIL_TO) {
      console.error('❌ Variáveis de ambiente ausentes');
      return res.status(500).json({
        error: 'Configuração do servidor incompleta'
      });
    }

    const mailOptions = {
      from: `"Patrocínios e Contrapartidas" <${process.env.EMAIL_USER}>`,
      to: process.env.EMAIL_TO,
      replyTo: data.email,
      subject: 'Novo Lead para Patrocínios e Contrapartidas Chegou! 🚀',
      html: `
        <p><strong>Nome:</strong> ${data.nome}</p>
        <p><strong>E-mail Corporativo:</strong> ${data.email}</p>
        <p><strong>Empresa/Instituição:</strong> ${data.empresa}</p>
        <p><strong>WhatsApp:</strong> ${data.telefone || '-'}</p>
        <p><strong>Categoria:</strong> ${data.categoria}</p>
        <p><strong>Mensagem:</strong> ${data.mensagem || "-"}</p>
      `
    };

    const info = await transporter.sendMail(mailOptions);

    console.log('✅ E-mail enviado com sucesso');
    console.log('📩 Message ID:', info.messageId);

    return res.status(200).json({
      success: true,
      message: 'Mensagem enviada com sucesso'
    });
  } catch (err) {
    console.error('❌ Erro na rota /send:', err);

    if (err instanceof ZodError) {
      return res.status(400).json({
        error: 'Dados inválidos',
        details: err.issues.map(issue => ({
          field: issue.path[0],
          message: issue.message
        }))
      });
    }

    return res.status(500).json({
      error: err.message || 'Erro interno no servidor'
    });
  }
});

app.use((req, res) => {
  res.status(404).json({
    error: 'Rota não encontrada'
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 SaaS rodando na porta ${PORT}`);
});