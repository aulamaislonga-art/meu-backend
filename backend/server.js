require('dotenv').config();

const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

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

const textField = (min = 0, message) => {
  const base = z.string().transform((value) => value.trim());
  return min > 0 ? base.min(min, message) : base.optional().default('');
};

const patrocinioSchema = z.object({
  tipo: z.literal('patrocinio'),
  nome: z.string().trim().min(2, 'O nome deve ter pelo menos 2 caracteres'),
  email: z.string().trim().email('E-mail inválido'),
  empresa: z.string().trim().min(2, 'A empresa deve ter pelo menos 2 caracteres'),
  telefone: textField(),
  categoria: textField(),
  mensagem: textField(),
  website: textField()
});

const inscricaoSchema = z.object({
  tipo: z.literal('inscricao'),
  modalidade: z.string().trim().min(2, 'Selecione a modalidade'),
  nome: z.string().trim().min(2, 'O nome deve ter pelo menos 2 caracteres'),
  sobrenome: z.string().trim().min(2, 'O sobrenome deve ter pelo menos 2 caracteres'),
  email: z.string().trim().email('E-mail inválido'),
  whatsapp: z.string().trim().min(8, 'WhatsApp inválido'),
  mensagem: textField(),
  website: textField()
});

const schema = z.discriminatedUnion('tipo', [patrocinioSchema, inscricaoSchema]);

const requiredEnv = ['EMAIL_USER', 'EMAIL_PASS'];
const missingEnv = requiredEnv.filter((key) => !process.env[key]);

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  family: 4,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  },
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 15000
});

const getRecipient = (tipo) => {
  if (tipo === 'patrocinio') {
    return process.env.EMAIL_TO_PATROCINIO || process.env.EMAIL_TO;
  }

  if (tipo === 'inscricao') {
    return process.env.EMAIL_TO_INSCRICAO || process.env.EMAIL_TO;
  }

  return process.env.EMAIL_TO;
};

const buildMailOptions = (data) => {
  if (data.tipo === 'patrocinio') {
    return {
      from: `"Patrocínios e Contrapartidas" <${process.env.EMAIL_USER}>`,
      to: getRecipient('patrocinio'),
      replyTo: data.email,
      subject: 'Novo lead de patrocínio e contrapartidas 🚀',
      html: `
        <h2>Novo lead de patrocínio</h2>
        <p><strong>Nome:</strong> ${data.nome}</p>
        <p><strong>E-mail corporativo:</strong> ${data.email}</p>
        <p><strong>Empresa/Instituição:</strong> ${data.empresa}</p>
        <p><strong>WhatsApp:</strong> ${data.telefone || '-'}</p>
        <p><strong>Categoria:</strong> ${data.categoria || '-'}</p>
        <p><strong>Mensagem:</strong> ${data.mensagem || '-'}</p>
      `
    };
  }

  return {
    from: `"Inscrições da Aula" <${process.env.EMAIL_USER}>`,
    to: getRecipient('inscricao'),
    replyTo: data.email,
    subject: 'Nova inscrição na aula recebida ✅',
    html: `
      <h2>Nova inscrição na aula</h2>
      <p><strong>Modalidade:</strong> ${data.modalidade}</p>
      <p><strong>Nome:</strong> ${data.nome} ${data.sobrenome}</p>
      <p><strong>E-mail:</strong> ${data.email}</p>
      <p><strong>WhatsApp:</strong> ${data.whatsapp}</p>
      <p><strong>Mensagem:</strong> ${data.mensagem || '-'}</p>
    `
  };
};

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
    const data = schema.parse(req.body);

    if (data.website && data.website.trim() !== '') {
      return res.status(400).json({ error: 'Spam detectado' });
    }

    if (missingEnv.length > 0) {
      return res.status(500).json({
        error: `Configuração do servidor incompleta: ${missingEnv.join(', ')}`
      });
    }

    const recipient = getRecipient(data.tipo);

    if (!recipient) {
      return res.status(500).json({
        error: 'Configuração do servidor incompleta: defina EMAIL_TO ou os destinatários específicos dos formulários'
      });
    }

    const mailOptions = buildMailOptions(data);
    await transporter.sendMail(mailOptions);

    return res.status(200).json({
      success: true,
      message: data.tipo === 'patrocinio'
        ? 'Lead de patrocínio enviado com sucesso'
        : 'Inscrição enviada com sucesso'
    });
  } catch (err) {
    if (err instanceof ZodError) {
      return res.status(400).json({
        error: 'Dados inválidos',
        details: err.issues.map((issue) => ({
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

app.listen(PORT);
