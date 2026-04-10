require('dotenv').config();

const fs = require('fs');
const path = require('path');
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const cors = require('cors');
const express = require('express');
const multer = require('multer');
const nodemailer = require('nodemailer');
const rateLimit = require('express-rate-limit');
const { z, ZodError } = require('zod');

const app = express();
app.set('trust proxy', 1);

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 80,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Muitas requisições. Tente novamente em alguns minutos.'
  }
});

app.use(limiter);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

const SITE_BASE_URL = (process.env.SITE_BASE_URL || 'https://aulamaislonga.com.br').replace(/\/$/, '');
const CHECKOUT_RECORDS_FILE = path.join(__dirname, 'checkout-records.json');

const DATA_DIR = path.join(__dirname, 'data');
const SUBMISSIONS_DIR = path.join(DATA_DIR, 'submissions');
const ATTACHMENTS_DIR = path.join(DATA_DIR, 'attachments');
const EMAIL_JOBS_DIR = path.join(DATA_DIR, 'email-jobs');
const EMAIL_AUDIT_FILE = path.join(DATA_DIR, 'email-jobs.jsonl');
const SUBMISSIONS_AUDIT_FILE = path.join(DATA_DIR, 'submissions.jsonl');


const CHECKOUT_CONFIG = {
  presencial: {
    key: 'presencial',
    flowType: 'inscricao',
    categoryLabel: 'Presencial - Três de Maio/RS',
    amount: 1000,
    title: 'Inscrição Presencial - Aula Mais Longa',
    description: 'Inscrição presencial para a Aula Mais Longa da História.',
    confirmationPath: '/checkout/confirmacao-inscricao'
  },
  guinness: {
    key: 'guinness',
    flowType: 'inscricao',
    categoryLabel: 'Online Guinness',
    amount: 800,
    title: 'Inscrição Online Guinness - Aula Mais Longa',
    description: 'Inscrição online com acesso à experiência principal da Aula Mais Longa.',
    confirmationPath: '/checkout/confirmacao-inscricao'
  },
  simples: {
    key: 'simples',
    flowType: 'inscricao',
    categoryLabel: 'Online Simples',
    amount: 500,
    title: 'Inscrição Online Simples - Aula Mais Longa',
    description: 'Inscrição online para acompanhar a Aula Mais Longa.',
    confirmationPath: '/checkout/confirmacao-inscricao'
  },
  alunomatheus: {
    key: 'alunomatheus',
    flowType: 'inscricao',
    categoryLabel: 'Presencial - Aluno Matheus',
    amount: 300,
    title: 'Inscrição Presencial - Aluno Matheus',
    description: 'Inscrição presencial promocional para aluno do Prof. Matheus.',
    confirmationPath: '/checkout/confirmacao-inscricao'
  },
  alunoonline: {
    key: 'alunoonline',
    flowType: 'inscricao',
    categoryLabel: 'Online Guinness - Aluno',
    amount: 400,
    title: 'Inscrição Online Guinness - Aluno',
    description: 'Inscrição online promocional para aluno.',
    confirmationPath: '/checkout/confirmacao-inscricao'
  },
  apoio: {
    key: 'apoio',
    flowType: 'patrocinio',
    categoryLabel: 'Apoio',
    amount: 12000,
    title: 'Apoio - Aula Mais Longa',
    description: 'Categoria para marcas e instituições que desejam apoiar o projeto.',
    confirmationPath: '/checkout/confirmacao-apoio'
  },
  colabinstitucional: {
    key: 'colabinstitucional',
    flowType: 'patrocinio',
    categoryLabel: 'Colaboração Institucional',
    amount: 50000,
    title: 'Colaboração Institucional - Aula Mais Longa',
    description: 'Cota institucional para marcas, entidades e organizações parceiras.',
    confirmationPath: '/checkout/confirmacao-apoio'
  },
  suporteestrategico: {
    key: 'suporteestrategico',
    flowType: 'patrocinio',
    categoryLabel: 'Suporte Estratégico',
    amount: 20000,
    title: 'Suporte Estratégico - Aula Mais Longa',
    description: 'Categoria voltada a parceiros com entrega estratégica para o projeto.',
    confirmationPath: '/checkout/confirmacao-apoio'
  },
  participacao: {
    key: 'participacao',
    flowType: 'patrocinio',
    categoryLabel: 'Participação',
    amount: 5000,
    title: 'Participação - Aula Mais Longa',
    description: 'Cota de participação para apoiadores do projeto.',
    confirmationPath: '/checkout/confirmacao-apoio'
  }
};

const SPONSOR_PAGE_ONLY_CATEGORIES = new Set([
  'Patrocínio Master (R$ 300.000 – 500.000)',
  'Patrocínio Oficial (R$ 100.000)',
  'Parceiro Estratégico (R$ 80.000 + Equipamentos)',
  'Outro / Quero Conversar'
]);

const allowedVolunteerExtensions = new Set(['.pdf', '.doc', '.docx']);
const allowedVolunteerMimeTypes = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/octet-stream'
]);

const textField = (min = 0, message = 'Campo inválido') => {
  if (min > 0) {
    return z.string().trim().min(min, message);
  }
  return z.string().trim().optional().default('');
};

const limitedTextField = (max = 1000) =>
  z.string().trim().optional().default('').refine(
    (value) => value.length <= max,
    `O texto pode ter no máximo ${max} caracteres`
  );

const emailField = () => z.string().trim().email('E-mail inválido');

const phoneField = (message = 'Telefone inválido') =>
  z.string().trim().refine((value) => {
    const digits = String(value || '').replace(/\D/g, '');
    return digits.length >= 10 && digits.length <= 11;
  }, message);

const patrocinioSchema = z.object({
  tipo: z.literal('patrocinio'),
  nome: z.string().trim().min(2, 'O nome deve ter pelo menos 2 caracteres'),
  email: emailField(),
  empresa: z.string().trim().min(2, 'A empresa deve ter pelo menos 2 caracteres'),
  telefone: phoneField('Telefone / WhatsApp inválido'),
  categoria: textField(2, 'Selecione a categoria'),
  mensagem: limitedTextField(1000),
  website: textField()
});

const inscricaoSchema = z.object({
  tipo: z.literal('inscricao'),
  modalidade: z.string().trim().min(2, 'Selecione a modalidade'),
  nome: z.string().trim().min(2, 'O nome deve ter pelo menos 2 caracteres'),
  sobrenome: z.string().trim().min(2, 'O sobrenome deve ter pelo menos 2 caracteres'),
  email: emailField(),
  whatsapp: phoneField('WhatsApp inválido'),
  mensagem: limitedTextField(1000),
  website: textField()
});

const alunoSchema = z.object({
  tipo: z.literal('aluno'),
  nome: z.string().trim().min(2, 'O nome deve ter pelo menos 2 caracteres'),
  email: emailField(),
  faculdade_universidade: z.string().trim().min(2, 'Informe a faculdade ou universidade'),
  curso: z.string().trim().min(2, 'Informe o curso'),
  linha_de_pesquisa: z.string().trim().min(3, 'Informe a linha de pesquisa'),
  tema_proposta_geral: z.string().trim().min(3, 'Informe o tema ou proposta geral'),
  mensagem: limitedTextField(1500),
  website: textField()
});

const voluntarioSchema = z.object({
  nome: z.string().trim().min(2, 'O nome deve ter pelo menos 2 caracteres'),
  email: emailField(),
  whatsapp: phoneField('WhatsApp inválido'),
  cidade: textField(),
  faculdade: z.string().trim().min(2, 'Informe a faculdade/universidade'),
  curso: z.string().trim().min(2, 'Informe o curso'),
  mensagem: limitedTextField(1500),
  website: textField()
});

const checkoutSchema = z.object({
  checkoutKey: z.string().trim().min(2, 'Checkout inválido'),
  nome: z.string().trim().min(2, 'O nome deve ter pelo menos 2 caracteres'),
  sobrenome: z.string().trim().optional().default(''),
  empresa: z.string().trim().optional().default(''),
  email: emailField(),
  telefone: z.string().trim().optional().default(''),
  whatsapp: z.string().trim().optional().default(''),
  mensagem: limitedTextField(1500),
  website: textField()
});

const leadSchema = z.discriminatedUnion('tipo', [patrocinioSchema, inscricaoSchema]);

const escapeHtml = (value = '') => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const safeJsonParse = (value, fallback) => {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const onlyDigits = (value = '') => String(value).replace(/\D/g, '');

const splitPhone = (value = '') => {
  const digits = onlyDigits(value);
  return {
    areaCode: digits.slice(0, 2),
    number: digits.slice(2)
  };
};

const splitName = (value = '') => {
  const normalized = String(value || '').trim().replace(/\s+/g, ' ');
  if (!normalized) return { firstName: '', lastName: '' };
  const parts = normalized.split(' ');
  const firstName = parts.shift() || normalized;
  const lastName = parts.join(' ') || '-';
  return { firstName, lastName };
};

const formatCurrency = (value) => new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL'
}).format(Number(value) || 0);

const formatDateTime = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo'
  }).format(date);
};

const getRequestBaseUrl = (req) => {
  const forwardedProto = req.headers['x-forwarded-proto'];
  const forwardedHost = req.headers['x-forwarded-host'];
  const protocol = (Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto) || req.protocol || 'https';
  const host = (Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost) || req.get('host');
  return `${protocol}://${host}`;
};

const getCheckoutConfig = (key) => CHECKOUT_CONFIG[String(key || '').trim().toLowerCase()] || null;

const buildCheckoutContext = (payload) => {
  const checkout = getCheckoutConfig(payload.checkoutKey);
  if (!checkout) {
    throw new Error('Checkout inválido.');
  }

  if (checkout.flowType === 'inscricao') {
    const whatsapp = payload.whatsapp || payload.telefone;
    if (!payload.sobrenome || payload.sobrenome.trim().length < 2) {
      throw new Error('Informe o sobrenome.');
    }
    if (!whatsapp || onlyDigits(whatsapp).length < 10) {
      throw new Error('Informe um WhatsApp válido com DDD.');
    }

    return {
      ...checkout,
      nomeCompleto: `${payload.nome} ${payload.sobrenome}`.trim(),
      whatsapp: payload.whatsapp || payload.telefone,
      telefone: payload.whatsapp || payload.telefone,
      empresa: ''
    };
  }

  if (!payload.empresa || payload.empresa.trim().length < 2) {
    throw new Error('Informe a empresa ou instituição.');
  }

  const telefone = payload.telefone || payload.whatsapp;
  if (!telefone || onlyDigits(telefone).length < 10) {
    throw new Error('Informe um telefone / WhatsApp válido com DDD.');
  }

  return {
    ...checkout,
    nomeCompleto: payload.nome,
    telefone,
    whatsapp: telefone,
    empresa: payload.empresa
  };
};

const requiredMailEnv = ['EMAIL_USER', 'EMAIL_PASS'];
const missingMailEnv = requiredMailEnv.filter((key) => !process.env[key]);
const missingCheckoutEnv = ['MP_ACCESS_TOKEN'].filter((key) => !process.env[key]);

const MAIL_SEND_CUSTOMER = String(process.env.MAIL_SEND_CUSTOMER || 'true').toLowerCase() !== 'false';
let smtpVerified = false;
let smtpLastError = '';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT || 587),
  secure: String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true',
  requireTLS: String(process.env.SMTP_REQUIRE_TLS || 'true').toLowerCase() !== 'false',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  },
  tls: {
    servername: process.env.SMTP_HOST || 'smtp.gmail.com',
    rejectUnauthorized: true
  },
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 15000,
  family: 4
});

const defaultFrom = () => process.env.EMAIL_FROM || `"Aula Mais Longa" <${process.env.EMAIL_USER}>`;

const htmlToPlainText = (value = '') => String(value || '')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<br\s*\/?>/gi, '\n')
  .replace(/<\/p>/gi, '\n\n')
  .replace(/<\/div>/gi, '\n')
  .replace(/<li>/gi, '- ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'")
  .replace(/\n{3,}/g, '\n\n')
  .replace(/[ \t]{2,}/g, ' ')
  .trim();

const enrichMailOptions = (mailOptions = {}) => {
  const html = typeof mailOptions.html === 'string' ? mailOptions.html : '';
  const text = typeof mailOptions.text === 'string' && mailOptions.text.trim()
    ? mailOptions.text
    : htmlToPlainText(html);

  return {
    from: defaultFrom(),
    ...mailOptions,
    text,
    headers: {
      'X-Auto-Response-Suppress': 'All',
      ...(mailOptions.headers || {})
    },
    envelope: mailOptions.envelope || {
      from: process.env.EMAIL_USER,
      to: Array.isArray(mailOptions.to) ? mailOptions.to : [mailOptions.to].filter(Boolean)
    }
  };
};

const logMailError = (context, error) => {
  console.error(`Falha no envio de e-mail (${context}):`, {
    message: error?.message,
    code: error?.code,
    response: error?.response,
    responseCode: error?.responseCode,
    command: error?.command
  });
};

const ensureDir = async (dirPath) => {
  await fs.promises.mkdir(dirPath, { recursive: true });
};

const safeSlug = (value = '') => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9_-]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .toLowerCase() || 'item';

const generateId = (prefix = 'id') => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

const atomicWriteJson = async (filePath, data) => {
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await fs.promises.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf8');
  await fs.promises.rename(tempPath, filePath);
};

const appendJsonl = async (filePath, data) => {
  await ensureDir(path.dirname(filePath));
  await fs.promises.appendFile(filePath, `${JSON.stringify(data)}\n`, 'utf8');
};

const readJsonFile = async (filePath, fallback = null) => {
  try {
    const raw = await fs.promises.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
};

let fileWriteQueue = Promise.resolve();

const withFileWriteQueue = async (callback) => {
  const run = fileWriteQueue.catch(() => undefined).then(callback);
  fileWriteQueue = run.catch(() => undefined);
  return run;
};

const ensureDataFiles = async () => {
  await ensureDir(DATA_DIR);
  await ensureDir(SUBMISSIONS_DIR);
  await ensureDir(ATTACHMENTS_DIR);
  await ensureDir(EMAIL_JOBS_DIR);
  await ensureDir(path.dirname(CHECKOUT_RECORDS_FILE));
  for (const filePath of [SUBMISSIONS_AUDIT_FILE, EMAIL_AUDIT_FILE]) {
    try {
      await fs.promises.access(filePath, fs.constants.F_OK);
    } catch {
      await fs.promises.writeFile(filePath, '', 'utf8');
    }
  }
};

const getSubmissionFile = (submissionId) => path.join(SUBMISSIONS_DIR, `${submissionId}.json`);
const getEmailJobFile = (jobId) => path.join(EMAIL_JOBS_DIR, `${jobId}.json`);

const saveAttachmentToDisk = async (file, submissionId) => {
  if (!file) return null;
  const extension = path.extname(file.originalname || '').toLowerCase() || '';
  const filename = `${submissionId}-${safeSlug(path.basename(file.originalname || 'arquivo', extension))}${extension}`;
  const targetPath = path.join(ATTACHMENTS_DIR, filename);
  await fs.promises.writeFile(targetPath, file.buffer);
  return {
    originalname: file.originalname,
    filename,
    path: targetPath,
    mimetype: file.mimetype,
    size: file.size
  };
};

const createSubmission = async ({ formType, payload, attachment = null, metadata = {} }) => withFileWriteQueue(async () => {
  await ensureDataFiles();
  const id = generateId('sub');
  const now = new Date().toISOString();
  const record = {
    id,
    formType,
    createdAt: now,
    updatedAt: now,
    status: 'received',
    payload,
    metadata,
    attachment,
    adminEmailStatus: 'pending',
    customerEmailStatus: payload?.email ? 'pending' : 'not_applicable',
    adminEmailAttempts: 0,
    customerEmailAttempts: 0,
    lastEmailError: '',
    confirmationSentAt: '',
    protocol: id
  };

  await atomicWriteJson(getSubmissionFile(id), record);
  await appendJsonl(SUBMISSIONS_AUDIT_FILE, {
    event: 'created',
    submissionId: id,
    formType,
    at: now,
    payload
  });

  return record;
});

const readSubmission = async (submissionId) => {
  return readJsonFile(getSubmissionFile(submissionId), null);
};

const updateSubmission = async (submissionId, patch) => withFileWriteQueue(async () => {
  const current = await readSubmission(submissionId);
  if (!current) return null;

  const nextPatch = typeof patch === 'function' ? patch(current) : patch;
  const next = {
    ...current,
    ...nextPatch,
    updatedAt: new Date().toISOString()
  };

  await atomicWriteJson(getSubmissionFile(submissionId), next);
  await appendJsonl(SUBMISSIONS_AUDIT_FILE, {
    event: 'updated',
    submissionId,
    at: next.updatedAt,
    patch: nextPatch
  });

  return next;
});

const queueEmailJob = async ({ submissionId, audience, mailOptions, context, attempts = 0, nextRetryAt = null }) => withFileWriteQueue(async () => {
  await ensureDataFiles();
  const jobId = generateId('mail');
  const now = new Date().toISOString();
  const job = {
    id: jobId,
    submissionId,
    audience,
    context,
    attempts,
    status: 'pending',
    nextRetryAt: nextRetryAt || now,
    createdAt: now,
    updatedAt: now,
    lastError: '',
    mailOptions
  };

  await atomicWriteJson(getEmailJobFile(jobId), job);
  await appendJsonl(EMAIL_AUDIT_FILE, {
    event: 'queued',
    jobId,
    submissionId,
    audience,
    context,
    at: now
  });
  return job;
});

const updateEmailJob = async (jobId, patch) => withFileWriteQueue(async () => {
  const filePath = getEmailJobFile(jobId);
  const current = await readJsonFile(filePath, null);
  if (!current) return null;

  const nextPatch = typeof patch === 'function' ? patch(current) : patch;
  const next = {
    ...current,
    ...nextPatch,
    updatedAt: new Date().toISOString()
  };

  await atomicWriteJson(filePath, next);
  await appendJsonl(EMAIL_AUDIT_FILE, {
    event: 'updated',
    jobId,
    at: next.updatedAt,
    patch: nextPatch
  });

  return next;
});

const listPendingEmailJobs = async () => {
  await ensureDataFiles();
  const files = await fs.promises.readdir(EMAIL_JOBS_DIR).catch(() => []);
  const jobs = [];

  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    const job = await readJsonFile(path.join(EMAIL_JOBS_DIR, file), null);
    if (!job || job.status !== 'pending') continue;
    jobs.push(job);
  }

  return jobs.sort((a, b) => new Date(a.nextRetryAt).getTime() - new Date(b.nextRetryAt).getTime());
};

const getRetryDelayMs = (attempts = 0) => {
  const delays = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000];
  return delays[Math.min(attempts, delays.length - 1)];
};

const markSubmissionEmailResult = async (submissionId, audience, { sent, errorMessage = '' }) => {
  const statusField = audience === 'admin' ? 'adminEmailStatus' : 'customerEmailStatus';
  const attemptsField = audience === 'admin' ? 'adminEmailAttempts' : 'customerEmailAttempts';

  return updateSubmission(submissionId, (current) => ({
    [statusField]: sent ? 'sent' : 'failed',
    [attemptsField]: Number(current[attemptsField] || 0) + 1,
    lastEmailError: sent ? '' : errorMessage,
    confirmationSentAt: sent && audience === 'customer' ? new Date().toISOString() : current.confirmationSentAt || ''
  }));
};

let emailWorkerRunning = false;

const processEmailJob = async (job) => {
  try {
    await sendMail(job.mailOptions, job.context || `job:${job.id}`);
    await updateEmailJob(job.id, { status: 'sent', lastError: '' });
    await markSubmissionEmailResult(job.submissionId, job.audience, { sent: true });
    return true;
  } catch (error) {
    const attempts = Number(job.attempts || 0) + 1;
    const nextRetryAt = new Date(Date.now() + getRetryDelayMs(attempts - 1)).toISOString();

    await updateEmailJob(job.id, {
      status: attempts >= 5 ? 'failed' : 'pending',
      attempts,
      nextRetryAt,
      lastError: error.message || 'Falha ao enviar e-mail'
    });

    await markSubmissionEmailResult(job.submissionId, job.audience, {
      sent: false,
      errorMessage: error.message || 'Falha ao enviar e-mail'
    });

    return false;
  }
};

const processPendingEmailJobs = async () => {
  if (emailWorkerRunning) return;
  emailWorkerRunning = true;

  try {
    const jobs = await listPendingEmailJobs();
    const now = Date.now();

    for (const job of jobs) {
      if (new Date(job.nextRetryAt || 0).getTime() > now) continue;
      await processEmailJob(job);
    }
  } finally {
    emailWorkerRunning = false;
  }
};

const queueSubmissionEmails = async ({ submissionId, adminMail, customerMail }) => {
  const jobs = [];

  if (adminMail) {
    jobs.push(queueEmailJob({
      submissionId,
      audience: 'admin',
      context: `${submissionId}:admin`,
      mailOptions: adminMail
    }));
  }

  if (customerMail) {
    jobs.push(queueEmailJob({
      submissionId,
      audience: 'customer',
      context: `${submissionId}:customer`,
      mailOptions: customerMail
    }));
  }

  const queued = await Promise.all(jobs);
  for (const job of queued) {
    await processEmailJob(job);
  }
  return queued;
};

const ensureCheckoutStoreFile = async () => {
  try {
    await fs.promises.access(CHECKOUT_RECORDS_FILE, fs.constants.F_OK);
  } catch {
    await fs.promises.writeFile(CHECKOUT_RECORDS_FILE, JSON.stringify({ records: [] }, null, 2), 'utf8');
  }
};

const readCheckoutStore = async () => {
  await ensureCheckoutStoreFile();
  const raw = await fs.promises.readFile(CHECKOUT_RECORDS_FILE, 'utf8');
  const parsed = safeJsonParse(raw, { records: [] });
  return parsed && Array.isArray(parsed.records) ? parsed : { records: [] };
};

const writeCheckoutStore = async (store) => {
  await fs.promises.writeFile(CHECKOUT_RECORDS_FILE, JSON.stringify(store, null, 2), 'utf8');
};

let checkoutStoreQueue = Promise.resolve();

const withCheckoutStore = async (callback) => {
  const run = checkoutStoreQueue.catch(() => undefined).then(async () => {
    const store = await readCheckoutStore();
    const result = await callback(store);
    await writeCheckoutStore(store);
    return result;
  });
  checkoutStoreQueue = run.catch(() => undefined);
  return run;
};

const findCheckoutRecord = async ({ externalReference, paymentId }) => {
  const store = await readCheckoutStore();
  return store.records.find((record) => {
    const sameExternal = externalReference && record.externalReference === externalReference;
    const samePayment = paymentId && String(record.paymentId || '') === String(paymentId || '');
    return sameExternal || samePayment;
  }) || null;
};

const upsertCheckoutRecord = async (record) => withCheckoutStore(async (store) => {
  const index = store.records.findIndex((item) => item.externalReference === record.externalReference);
  if (index >= 0) {
    store.records[index] = {
      ...store.records[index],
      ...record,
      updatedAt: new Date().toISOString()
    };
    return store.records[index];
  }

  const created = {
    customerStatusEmailsSent: [],
    adminStatusEmailsSent: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...record
  };

  store.records.push(created);
  return created;
});

const updateCheckoutRecord = async (externalReference, patch) => withCheckoutStore(async (store) => {
  const index = store.records.findIndex((item) => item.externalReference === externalReference);
  if (index < 0) return null;

  const nextPatch = typeof patch === 'function' ? patch(store.records[index]) : patch;
  store.records[index] = {
    ...store.records[index],
    ...nextPatch,
    updatedAt: new Date().toISOString()
  };

  return store.records[index];
});

const pushUnique = (list = [], value) => {
  if (!value) return Array.isArray(list) ? list : [];
  const base = Array.isArray(list) ? list : [];
  return base.includes(value) ? base : [...base, value];
};

const resolveTopicFromNotification = (req) => {
  const body = req.body || {};
  return String(body.type || body.topic || req.query.topic || req.query.type || '').trim().toLowerCase();
};

const resolvePaymentIdFromNotification = (req) => {
  const body = req.body || {};
  return String(body?.data?.id || body?.id || req.query['data.id'] || req.query.id || '').trim();
};

const getRecipient = (kind) => {
  if (kind === 'patrocinio') {
    return process.env.EMAIL_TO_PATROCINIO || process.env.EMAIL_TO;
  }
  if (kind === 'inscricao') {
    return process.env.EMAIL_TO_INSCRICAO || process.env.EMAIL_TO;
  }
  if (kind === 'aluno') {
    return process.env.EMAIL_TO_ALUNO || process.env.EMAIL_TO;
  }
  if (kind === 'voluntario') {
    return process.env.EMAIL_TO_VOLUNTARIO || process.env.EMAIL_TO;
  }
  return process.env.EMAIL_TO;
};

const ensureMailConfigured = (recipient) => {
  if (missingMailEnv.length > 0) {
    throw new Error(`Configuração do servidor incompleta: ${missingMailEnv.join(', ')}`);
  }
  if (!recipient) {
    throw new Error('Configuração do servidor incompleta: defina EMAIL_TO ou o destinatário específico do formulário.');
  }
};

const sendMail = async (mailOptions, context = 'geral') => {
  try {
    const info = await transporter.sendMail(enrichMailOptions(mailOptions));
    console.log('E-mail enviado:', {
      context,
      messageId: info?.messageId,
      response: info?.response,
      accepted: info?.accepted,
      rejected: info?.rejected
    });
    return info;
  } catch (error) {
    logMailError(context, error);
    throw error;
  }
};

const sendMailIfPossible = async (mailOptions, context = 'geral') => {
  if (missingMailEnv.length > 0) {
    throw new Error(`Configuração do servidor incompleta: ${missingMailEnv.join(', ')}`);
  }
  return sendMail(mailOptions, context);
};

const buildLeadAdminMail = (data) => {
  if (data.tipo === 'patrocinio') {
    return {
      from: defaultFrom(),
      to: getRecipient('patrocinio'),
      replyTo: data.email,
      subject: 'Novo lead de patrocínio recebido',
      html: `
        <h2>Novo lead de patrocínio</h2>
        <p><strong>Nome:</strong> ${escapeHtml(data.nome)}</p>
        <p><strong>E-mail:</strong> ${escapeHtml(data.email)}</p>
        <p><strong>Empresa / Instituição:</strong> ${escapeHtml(data.empresa)}</p>
        <p><strong>Telefone:</strong> ${escapeHtml(data.telefone)}</p>
        <p><strong>Categoria:</strong> ${escapeHtml(data.categoria)}</p>
        <p><strong>Mensagem:</strong> ${escapeHtml(data.mensagem || '-')}</p>
      `
    };
  }

  return {
    from: defaultFrom(),
    to: getRecipient('inscricao'),
    replyTo: data.email,
    subject: 'Nova inscrição recebida',
    html: `
      <h2>Nova inscrição</h2>
      <p><strong>Modalidade:</strong> ${escapeHtml(data.modalidade)}</p>
      <p><strong>Nome:</strong> ${escapeHtml(`${data.nome} ${data.sobrenome}`)}</p>
      <p><strong>E-mail:</strong> ${escapeHtml(data.email)}</p>
      <p><strong>WhatsApp:</strong> ${escapeHtml(data.whatsapp)}</p>
      <p><strong>Mensagem:</strong> ${escapeHtml(data.mensagem || '-')}</p>
    `
  };
};

const buildLeadCustomerMail = (data) => {
  if (data.tipo === 'patrocinio') {
    const pageOnly = SPONSOR_PAGE_ONLY_CATEGORIES.has(data.categoria);
    return {
      from: defaultFrom(),
      to: data.email,
      subject: 'Recebemos seu interesse na Aula Mais Longa',
      html: `
        <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.65;color:#1f2937;max-width:640px;margin:0 auto;">
          <h2>Olá, ${escapeHtml(data.nome)}!</h2>
          <p>Recebemos seu interesse na categoria <strong>${escapeHtml(data.categoria)}</strong>.</p>
          <p>${pageOnly
            ? 'Nossa equipe fará contato para alinhamento comercial, institucional e operacional da parceria.'
            : 'Se a sua categoria envolver checkout, você será direcionado para a etapa de pagamento na sequência.'}</p>
          <p>Obrigado por apoiar a Aula Mais Longa.</p>
        </div>
      `
    };
  }

  return {
    from: defaultFrom(),
    to: data.email,
    subject: 'Recebemos sua inscrição na Aula Mais Longa',
    html: `
      <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.65;color:#1f2937;max-width:640px;margin:0 auto;">
        <h2>Olá, ${escapeHtml(data.nome)}!</h2>
        <p>Recebemos sua inscrição na modalidade <strong>${escapeHtml(data.modalidade)}</strong>.</p>
        <p>Nos próximos passos, você seguirá para o checkout correspondente e receberá atualizações automáticas sobre o pagamento.</p>
        <p>Obrigado por fazer parte da Aula Mais Longa.</p>
      </div>
    `
  };
};

const buildStudentAdminMail = (data) => ({
  from: defaultFrom(),
  to: getRecipient('aluno'),
  replyTo: data.email,
  subject: 'Nova proposta acadêmica recebida',
  html: `
    <h2>Nova proposta acadêmica</h2>
    <p><strong>Nome:</strong> ${escapeHtml(data.nome)}</p>
    <p><strong>E-mail:</strong> ${escapeHtml(data.email)}</p>
    <p><strong>Faculdade / Universidade:</strong> ${escapeHtml(data.faculdade_universidade)}</p>
    <p><strong>Curso:</strong> ${escapeHtml(data.curso)}</p>
    <p><strong>Linha de pesquisa:</strong> ${escapeHtml(data.linha_de_pesquisa)}</p>
    <p><strong>Tema / proposta geral:</strong> ${escapeHtml(data.tema_proposta_geral)}</p>
    <p><strong>Mensagem:</strong> ${escapeHtml(data.mensagem || '-')}</p>
  `
});

const buildStudentCustomerMail = (data) => ({
  from: defaultFrom(),
  to: data.email,
  subject: 'Recebemos sua proposta acadêmica',
  html: `
    <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.65;color:#1f2937;max-width:640px;margin:0 auto;">
      <h2>Olá, ${escapeHtml(data.nome)}!</h2>
      <p>Recebemos sua proposta acadêmica para a Aula Mais Longa.</p>
      <p>Nossa equipe fará a organização inicial das linhas de pesquisa e poderá entrar em contato caso seja necessário complementar alguma informação.</p>
    </div>
  `
});

const buildVolunteerAdminMail = (data, file) => {
  const mail = {
    from: defaultFrom(),
    to: getRecipient('voluntario'),
    replyTo: data.email,
    subject: 'Novo cadastro de voluntário recebido',
    html: `
      <h2>Novo cadastro de voluntário</h2>
      <p><strong>Nome:</strong> ${escapeHtml(data.nome)}</p>
      <p><strong>E-mail:</strong> ${escapeHtml(data.email)}</p>
      <p><strong>WhatsApp:</strong> ${escapeHtml(data.whatsapp)}</p>
      <p><strong>Cidade:</strong> ${escapeHtml(data.cidade || '-')}</p>
      <p><strong>Faculdade / Universidade:</strong> ${escapeHtml(data.faculdade)}</p>
      <p><strong>Curso:</strong> ${escapeHtml(data.curso)}</p>
      <p><strong>Mensagem:</strong> ${escapeHtml(data.mensagem || '-')}</p>
      <p><strong>CV anexado:</strong> ${file ? 'Sim' : 'Não'}</p>
    `
  };

  if (file) {
    mail.attachments = [{
      filename: file.originalname,
      content: file.buffer,
      contentType: file.mimetype
    }];
  }

  return mail;
};

const buildVolunteerCustomerMail = (data) => ({
  from: defaultFrom(),
  to: data.email,
  subject: 'Recebemos seu cadastro de voluntário',
  html: `
    <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.65;color:#1f2937;max-width:640px;margin:0 auto;">
      <h2>Olá, ${escapeHtml(data.nome)}!</h2>
      <p>Recebemos seu cadastro de voluntário para a Aula Mais Longa.</p>
      <p>Nosso time pode entrar em contato para próximas etapas, alinhamentos ou informações complementares.</p>
    </div>
  `
});

const mapPaymentStatus = (status = '', statusDetail = '') => {
  const normalizedStatus = String(status || '').toLowerCase();
  const normalizedDetail = String(statusDetail || '').toLowerCase();

  if (normalizedStatus === 'approved') {
    return {
      normalized: 'approved',
      pageStatus: 'success',
      label: 'Aprovado',
      title: 'Pagamento confirmado',
      message: 'Seu pagamento foi aprovado com sucesso.'
    };
  }

  if (['pending', 'in_process', 'in_mediation', 'authorized'].includes(normalizedStatus)) {
    return {
      normalized: 'pending',
      pageStatus: 'pending',
      label: 'Pendente',
      title: 'Pagamento pendente',
      message: 'Recebemos seu checkout e o pagamento está em análise ou aguardando compensação.'
    };
  }

  if (['rejected', 'cancelled', 'cancelled_by_user', 'refunded', 'charged_back'].includes(normalizedStatus) || normalizedDetail.includes('rejected')) {
    return {
      normalized: 'failure',
      pageStatus: 'failure',
      label: 'Não concluído',
      title: 'Pagamento não concluído',
      message: 'O pagamento não foi concluído.'
    };
  }

  return {
    normalized: 'pending',
    pageStatus: 'pending',
    label: 'Em análise',
    title: 'Pagamento em análise',
    message: 'Recebemos seu pagamento e ainda estamos aguardando uma atualização final do meio de pagamento.'
  };
};

const buildCheckoutAdminMail = (record, stage = 'created') => {
  const statusInfo = stage === 'created'
    ? mapPaymentStatus('pending')
    : mapPaymentStatus(record.paymentStatusRaw, record.paymentStatusDetail);

  const flowLabel = record.flowType === 'inscricao' ? 'inscrição' : 'apoio';

  return {
    from: defaultFrom(),
    to: getRecipient(record.flowType),
    replyTo: record.email,
    subject: stage === 'created'
      ? `Novo checkout de ${flowLabel} iniciado`
      : `Atualização de pagamento (${record.categoryLabel}): ${statusInfo.label}`,
    html: `
      <h2>${stage === 'created' ? 'Novo checkout iniciado' : 'Atualização de pagamento recebida'}</h2>
      <p><strong>Tipo:</strong> ${escapeHtml(flowLabel)}</p>
      <p><strong>Categoria / modalidade:</strong> ${escapeHtml(record.categoryLabel)}</p>
      <p><strong>Status do pagamento:</strong> ${escapeHtml(statusInfo.label)}</p>
      <p><strong>Valor:</strong> ${escapeHtml(formatCurrency(record.amount))}</p>
      <p><strong>Nome:</strong> ${escapeHtml(record.nomeCompleto)}</p>
      ${record.empresa ? `<p><strong>Empresa:</strong> ${escapeHtml(record.empresa)}</p>` : ''}
      <p><strong>E-mail:</strong> ${escapeHtml(record.email)}</p>
      <p><strong>Telefone:</strong> ${escapeHtml(record.telefone || record.whatsapp || '-')}</p>
      <p><strong>Mensagem:</strong> ${escapeHtml(record.mensagem || '-')}</p>
      <p><strong>Referência:</strong> ${escapeHtml(record.externalReference || '-')}</p>
      <p><strong>Preference ID:</strong> ${escapeHtml(record.preferenceId || '-')}</p>
      <p><strong>Payment ID:</strong> ${escapeHtml(record.paymentId || '-')}</p>
      <p><strong>Detalhe do status:</strong> ${escapeHtml(record.paymentStatusDetail || '-')}</p>
      <p><strong>Atualizado em:</strong> ${escapeHtml(formatDateTime(record.updatedAt))}</p>
    `
  };
};

const buildCheckoutCustomerMail = (record, stage = 'created') => {
  const statusInfo = stage === 'created'
    ? mapPaymentStatus('pending')
    : mapPaymentStatus(record.paymentStatusRaw, record.paymentStatusDetail);

  const intro = stage === 'created'
    ? 'Recebemos seus dados e já registramos o início do seu checkout.'
    : statusInfo.message;

  const nextStepText = record.flowType === 'patrocinio'
    ? 'Nossa equipe fará o alinhamento comercial e operacional da parceria, incluindo formalização contratual, validação da marca e organização das contrapartidas previstas.'
    : 'Você receberá acesso e orientações conforme a confirmação do pagamento e a organização do evento.';

  return {
    from: defaultFrom(),
    to: record.email,
    subject: stage === 'created'
      ? `Recebemos seu checkout - ${record.categoryLabel}`
      : statusInfo.normalized === 'approved'
        ? `Pagamento confirmado - ${record.categoryLabel}`
        : statusInfo.normalized === 'failure'
          ? `Pagamento não concluído - ${record.categoryLabel}`
          : `Atualização do seu pagamento - ${record.categoryLabel}`,
    html: `
      <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.65;color:#1f2937;max-width:640px;margin:0 auto;">
        <h2>Olá, ${escapeHtml(record.nome)}!</h2>
        <p>${escapeHtml(intro)}</p>
        <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin:20px 0;">
          <p style="margin:0 0 8px;"><strong>Status do pagamento:</strong> ${escapeHtml(statusInfo.label)}</p>
          <p style="margin:0 0 8px;"><strong>Categoria / modalidade:</strong> ${escapeHtml(record.categoryLabel)}</p>
          <p style="margin:0 0 8px;"><strong>Valor:</strong> ${escapeHtml(formatCurrency(record.amount))}</p>
          <p style="margin:0;"><strong>Referência:</strong> ${escapeHtml(record.externalReference || '-')}</p>
        </div>
        <p>${escapeHtml(nextStepText)}</p>
        <p>Se precisar de ajuda, responda este e-mail ou fale com a organização.</p>
      </div>
    `
  };
};

const createMercadoPagoPreference = async (payload) => {
  const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || 'Falha ao criar preferência de pagamento no Mercado Pago.');
  }

  return response.json();
};

const getMercadoPagoPayment = async (paymentId) => {
  const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || 'Falha ao consultar pagamento no Mercado Pago.');
  }

  return response.json();
};

const createCheckoutPreference = async (req, res, forcedCheckoutKey = null) => {
  try {
    const parsed = checkoutSchema.parse({
      checkoutKey: forcedCheckoutKey || req.body.checkoutKey,
      nome: req.body.nome,
      sobrenome: req.body.sobrenome,
      empresa: req.body.empresa,
      email: req.body.email,
      telefone: req.body.telefone,
      whatsapp: req.body.whatsapp,
      mensagem: req.body.mensagem,
      website: req.body.website || req.body._honey || ''
    });

    if (parsed.website && parsed.website.trim() !== '') {
      return res.status(400).json({ error: 'Spam detectado.' });
    }

    const checkout = buildCheckoutContext(parsed);

    if (missingCheckoutEnv.length > 0 || missingMailEnv.length > 0) {
      return res.status(500).json({
        error: `Configuração do servidor incompleta: ${[...missingMailEnv, ...missingCheckoutEnv].join(', ')}`
      });
    }

    const recipient = getRecipient(checkout.flowType);
    ensureMailConfigured(recipient);

    const submission = await createSubmission({
      formType: 'checkout',
      payload: {
        ...parsed,
        checkoutKey: checkout.key,
        flowType: checkout.flowType,
        categoryLabel: checkout.categoryLabel,
        amount: checkout.amount,
        nomeCompleto: checkout.nomeCompleto,
        telefoneFinal: checkout.telefone || checkout.whatsapp || ''
      },
      metadata: {
        source: 'checkout',
        forcedCheckoutKey: forcedCheckoutKey || null
      }
    });

    const { firstName, lastName } = splitName(checkout.nomeCompleto);
    const payerPhone = splitPhone(checkout.telefone || checkout.whatsapp || '');
    const externalReference = `${checkout.key}-${Date.now()}`;
    const confirmationUrl = `${SITE_BASE_URL}${checkout.confirmationPath}`;

    const payload = {
      items: [{
        title: checkout.title,
        description: checkout.description,
        quantity: 1,
        currency_id: 'BRL',
        unit_price: checkout.amount
      }],
      payer: {
        name: firstName || parsed.nome,
        surname: lastName || '-',
        email: parsed.email,
        phone: {
          area_code: payerPhone.areaCode,
          number: payerPhone.number
        }
      },
      external_reference: externalReference,
      statement_descriptor: 'AULA+LONGA',
      back_urls: {
        success: `${confirmationUrl}?return_status=success`,
        pending: `${confirmationUrl}?return_status=pending`,
        failure: `${confirmationUrl}?return_status=failure`
      },
      auto_return: 'approved',
      notification_url: `${getRequestBaseUrl(req)}/checkout/payment-notifications`,
      metadata: {
        checkout_key: checkout.key,
        flow_type: checkout.flowType,
        category_label: checkout.categoryLabel,
        nome: parsed.nome,
        sobrenome: parsed.sobrenome || '',
        empresa: parsed.empresa || '',
        email: parsed.email,
        telefone: checkout.telefone || checkout.whatsapp || '',
        mensagem: parsed.mensagem || '',
        submission_id: submission.id
      }
    };

    const preference = await createMercadoPagoPreference(payload);
    const checkoutUrl = preference.init_point || preference.sandbox_init_point;

    if (!checkoutUrl) {
      await updateSubmission(submission.id, {
        status: 'checkout_error',
        lastEmailError: 'A preferência foi criada, mas o checkout não foi retornado pela API.'
      });
      throw new Error('A preferência foi criada, mas o checkout não foi retornado pela API.');
    }

    let record = await upsertCheckoutRecord({
      submissionId: submission.id,
      externalReference,
      checkoutKey: checkout.key,
      flowType: checkout.flowType,
      categoryLabel: checkout.categoryLabel,
      nome: parsed.nome,
      sobrenome: parsed.sobrenome || '',
      nomeCompleto: checkout.nomeCompleto,
      empresa: checkout.empresa || '',
      email: parsed.email,
      telefone: checkout.telefone || '',
      whatsapp: checkout.whatsapp || '',
      mensagem: parsed.mensagem || '',
      amount: checkout.amount,
      checkoutUrl,
      preferenceId: preference.id || '',
      paymentId: '',
      paymentStatusRaw: 'pending',
      paymentStatusDetail: 'checkout_started',
      paymentStatusNormalized: 'pending',
      paymentStatusLabel: 'Pendente',
      pageStatus: 'pending'
    });

    await updateSubmission(submission.id, {
      status: 'checkout_started',
      externalReference,
      checkoutUrl,
      preferenceId: preference.id || '',
      paymentStatus: 'pending'
    });

    const customerMail = MAIL_SEND_CUSTOMER ? buildCheckoutCustomerMail(record, 'created') : null;
    await queueSubmissionEmails({
      submissionId: submission.id,
      adminMail: buildCheckoutAdminMail(record, 'created'),
      customerMail
    });

    record = await updateCheckoutRecord(externalReference, (current) => ({
      customerStatusEmailsSent: current.customerStatusEmailsSent,
      adminStatusEmailsSent: current.adminStatusEmailsSent
    })) || record;

    const updatedSubmission = await readSubmission(submission.id);

    return res.status(200).json({
      success: true,
      message: 'Checkout iniciado com sucesso.',
      protocol: submission.protocol,
      checkoutUrl,
      externalReference,
      preferenceId: preference.id || null,
      emailStatus: {
        customer: MAIL_SEND_CUSTOMER ? updatedSubmission?.customerEmailStatus || 'pending' : 'disabled',
        admin: updatedSubmission?.adminEmailStatus || 'pending'
      }
    });
  } catch (error) {
    console.error('Erro ao criar checkout:', error);

    if (error instanceof ZodError) {
      return res.status(400).json({
        error: 'Dados inválidos',
        details: error.issues.map((issue) => ({
          field: issue.path[0],
          message: issue.message
        }))
      });
    }

    return res.status(500).json({ error: error.message || 'Erro ao iniciar checkout.' });
  }
};

const readCheckoutStatus = async (req, res) => {
  try {
    const externalReference = String(req.query.external_reference || req.query.externalReference || '').trim();
    const paymentId = String(req.query.payment_id || req.query.paymentId || req.query.collection_id || '').trim();

    if (!externalReference && !paymentId) {
      return res.status(400).json({
        error: 'Informe payment_id/collection_id ou external_reference para consultar o status.'
      });
    }

    const record = await findCheckoutRecord({ externalReference, paymentId });
    if (!record) {
      return res.status(404).json({ error: 'Nenhum registro encontrado para esta referência.' });
    }

    return res.status(200).json({
      success: true,
      record: {
        externalReference: record.externalReference,
        preferenceId: record.preferenceId || null,
        paymentId: record.paymentId || null,
        paymentStatusRaw: record.paymentStatusRaw || 'pending',
        paymentStatusDetail: record.paymentStatusDetail || '',
        paymentStatusNormalized: record.paymentStatusNormalized || 'pending',
        paymentStatusLabel: record.paymentStatusLabel || 'Pendente',
        pageStatus: record.pageStatus || 'pending',
        categoryLabel: record.categoryLabel,
        checkoutKey: record.checkoutKey,
        flowType: record.flowType,
        nome: record.nome,
        empresa: record.empresa,
        email: record.email,
        updatedAt: record.updatedAt
      }
    });
  } catch (error) {
    console.error('Erro ao consultar status do checkout:', error);
    return res.status(500).json({ error: error.message || 'Erro ao consultar status do checkout.' });
  }
};

const processPaymentNotification = async (req, res) => {
  try {
    if (missingCheckoutEnv.length > 0) {
      return res.status(500).json({
        error: `Configuração do servidor incompleta: ${missingCheckoutEnv.join(', ')}`
      });
    }

    const topic = resolveTopicFromNotification(req);
    const paymentId = resolvePaymentIdFromNotification(req);

    if (topic && !topic.includes('payment')) {
      return res.status(200).json({ received: true, ignored: true, reason: `Notificação ignorada para o tópico ${topic}` });
    }

    if (!paymentId) {
      return res.status(200).json({ received: true, ignored: true, reason: 'Notificação sem payment id' });
    }

    const payment = await getMercadoPagoPayment(paymentId);
    const externalReference = String(payment.external_reference || '').trim();

    if (!externalReference) {
      return res.status(200).json({ received: true, ignored: true, reason: 'Pagamento sem external_reference' });
    }

    const currentRecord = await findCheckoutRecord({ externalReference, paymentId });
    if (!currentRecord) {
      return res.status(200).json({ received: true, ignored: true, reason: 'Registro local não encontrado para a referência recebida' });
    }

    const statusInfo = mapPaymentStatus(payment.status, payment.status_detail);
    const updated = await updateCheckoutRecord(externalReference, (record) => ({
      paymentId: String(payment.id || paymentId),
      merchantOrderId: payment.order?.id || payment.order || record.merchantOrderId || '',
      paymentStatusRaw: payment.status || record.paymentStatusRaw || 'pending',
      paymentStatusDetail: payment.status_detail || record.paymentStatusDetail || '',
      paymentStatusNormalized: statusInfo.normalized,
      paymentStatusLabel: statusInfo.label,
      pageStatus: statusInfo.pageStatus,
      paymentMethodId: payment.payment_method_id || record.paymentMethodId || '',
      dateApproved: payment.date_approved || record.dateApproved || '',
      dateLastUpdated: payment.date_last_updated || record.dateLastUpdated || ''
    }));

    if (!updated) {
      return res.status(200).json({ received: true, ignored: true, reason: 'Não foi possível atualizar o registro local' });
    }

    const shouldSendCustomer = MAIL_SEND_CUSTOMER && !updated.customerStatusEmailsSent?.includes(statusInfo.normalized);
    const shouldSendAdmin = !updated.adminStatusEmailsSent?.includes(statusInfo.normalized);

    if (updated.submissionId) {
      await updateSubmission(updated.submissionId, {
        status: `payment_${statusInfo.normalized}`,
        paymentId: String(payment.id || paymentId),
        paymentStatus: statusInfo.normalized,
        paymentStatusLabel: statusInfo.label,
        paymentStatusDetail: payment.status_detail || ''
      });
    }

    if (updated.submissionId && (shouldSendCustomer || shouldSendAdmin)) {
      await queueSubmissionEmails({
        submissionId: updated.submissionId,
        adminMail: shouldSendAdmin ? buildCheckoutAdminMail(updated, 'status') : null,
        customerMail: shouldSendCustomer ? buildCheckoutCustomerMail(updated, 'status') : null
      });
    }

    const refreshedSubmission = updated.submissionId ? await readSubmission(updated.submissionId) : null;

    await updateCheckoutRecord(externalReference, (record) => ({
      customerStatusEmailsSent: refreshedSubmission?.customerEmailStatus === 'sent'
        ? pushUnique(record.customerStatusEmailsSent, statusInfo.normalized)
        : record.customerStatusEmailsSent,
      adminStatusEmailsSent: refreshedSubmission?.adminEmailStatus === 'sent'
        ? pushUnique(record.adminStatusEmailsSent, statusInfo.normalized)
        : record.adminStatusEmailsSent
    }));

    return res.status(200).json({
      received: true,
      paymentId,
      externalReference,
      status: payment.status,
      normalizedStatus: statusInfo.normalized
    });
  } catch (error) {
    console.error('Erro ao processar notificação do pagamento:', error);
    return res.status(500).json({ error: error.message || 'Erro ao processar notificação do pagamento.' });
  }
};

const validateVolunteerFile = (file) => {
  if (!file) return null;
  const extension = path.extname(file.originalname || '').toLowerCase();
  const isAllowedExtension = allowedVolunteerExtensions.has(extension);
  const isAllowedMime = allowedVolunteerMimeTypes.has(file.mimetype);
  if (!isAllowedExtension || !isAllowedMime) {
    return 'Arquivo inválido. Envie apenas PDF, DOC ou DOCX.';
  }
  return null;
};

app.get('/', (req, res) => {
  res.status(200).send('Servidor online');
});

app.get('/health', async (req, res) => {
  const store = await readCheckoutStore().catch(() => ({ records: [] }));
  const pendingEmailJobs = await listPendingEmailJobs().catch(() => []);
  res.status(200).json({
    status: 'ok',
    env: {
      emailConfigured: missingMailEnv.length === 0,
      mercadoPagoConfigured: missingCheckoutEnv.length === 0,
      mailSendCustomer: MAIL_SEND_CUSTOMER
    },
    smtp: {
      verified: smtpVerified,
      lastError: smtpLastError
    },
    checkoutRecords: Array.isArray(store.records) ? store.records.length : 0,
    pendingEmailJobs: pendingEmailJobs.length,
    uptime: process.uptime()
  });
});

app.post('/send', async (req, res) => {
  try {
    const data = leadSchema.parse(req.body);

    if (data.website && data.website.trim() !== '') {
      return res.status(400).json({ error: 'Spam detectado.' });
    }

    const recipient = getRecipient(data.tipo);
    ensureMailConfigured(recipient);

    const submission = await createSubmission({
      formType: data.tipo,
      payload: data,
      metadata: { source: '/send' }
    });

    await queueSubmissionEmails({
      submissionId: submission.id,
      adminMail: buildLeadAdminMail(data),
      customerMail: MAIL_SEND_CUSTOMER ? buildLeadCustomerMail(data) : null
    });

    const refreshed = await readSubmission(submission.id);

    return res.status(200).json({
      success: true,
      protocol: submission.protocol,
      message: data.tipo === 'patrocinio' ? 'Lead recebido com sucesso.' : 'Inscrição recebida com sucesso.',
      emailStatus: {
        admin: refreshed?.adminEmailStatus || 'pending',
        customer: MAIL_SEND_CUSTOMER ? (refreshed?.customerEmailStatus || 'pending') : 'disabled'
      }
    });
  } catch (error) {
    console.error('Erro em /send:', error);
    if (error instanceof ZodError) {
      return res.status(400).json({
        error: 'Dados inválidos',
        details: error.issues.map((issue) => ({ field: issue.path[0], message: issue.message }))
      });
    }
    return res.status(500).json({ error: error.message || 'Erro interno do servidor.' });
  }
});

app.post('/send-aluno', async (req, res) => {
  try {
    const data = alunoSchema.parse(req.body);

    if (data.website && data.website.trim() !== '') {
      return res.status(400).json({ error: 'Spam detectado.' });
    }

    const recipient = getRecipient('aluno');
    ensureMailConfigured(recipient);

    const submission = await createSubmission({
      formType: 'aluno',
      payload: data,
      metadata: { source: '/send-aluno' }
    });

    await queueSubmissionEmails({
      submissionId: submission.id,
      adminMail: buildStudentAdminMail(data),
      customerMail: MAIL_SEND_CUSTOMER ? buildStudentCustomerMail(data) : null
    });

    const refreshed = await readSubmission(submission.id);

    return res.status(200).json({
      success: true,
      protocol: submission.protocol,
      message: 'Proposta acadêmica recebida com sucesso.',
      emailStatus: {
        admin: refreshed?.adminEmailStatus || 'pending',
        customer: MAIL_SEND_CUSTOMER ? (refreshed?.customerEmailStatus || 'pending') : 'disabled'
      }
    });
  } catch (error) {
    console.error('Erro em /send-aluno:', error);
    if (error instanceof ZodError) {
      return res.status(400).json({
        error: 'Dados inválidos',
        details: error.issues.map((issue) => ({ field: issue.path[0], message: issue.message }))
      });
    }
    return res.status(500).json({ error: error.message || 'Erro interno do servidor.' });
  }
});

app.post('/send-voluntario', upload.single('attachment'), async (req, res) => {
  try {
    const data = voluntarioSchema.parse({
      nome: req.body.nome,
      email: req.body.email,
      whatsapp: req.body.whatsapp,
      cidade: req.body.cidade,
      faculdade: req.body.faculdade,
      curso: req.body.curso,
      mensagem: req.body.mensagem,
      website: req.body.website || req.body._honey || ''
    });

    if (data.website && data.website.trim() !== '') {
      return res.status(400).json({ error: 'Spam detectado.' });
    }

    const fileError = validateVolunteerFile(req.file);
    if (fileError) {
      return res.status(400).json({ error: fileError });
    }

    const recipient = getRecipient('voluntario');
    ensureMailConfigured(recipient);

    const submission = await createSubmission({
      formType: 'voluntario',
      payload: data,
      metadata: { source: '/send-voluntario' }
    });

    const attachment = await saveAttachmentToDisk(req.file, submission.id);
    if (attachment) {
      await updateSubmission(submission.id, { attachment });
    }

    const adminMail = buildVolunteerAdminMail(data, req.file)
    const customerMail = MAIL_SEND_CUSTOMER ? buildVolunteerCustomerMail(data) : null;

    await queueSubmissionEmails({
      submissionId: submission.id,
      adminMail,
      customerMail
    });

    const refreshed = await readSubmission(submission.id);

    return res.status(200).json({
      success: true,
      protocol: submission.protocol,
      message: 'Cadastro de voluntário recebido com sucesso.',
      emailStatus: {
        admin: refreshed?.adminEmailStatus || 'pending',
        customer: MAIL_SEND_CUSTOMER ? (refreshed?.customerEmailStatus || 'pending') : 'disabled'
      }
    });
  } catch (error) {
    console.error('Erro em /send-voluntario:', error);
    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'O arquivo excede o limite de 10 MB.' });
      }
      return res.status(400).json({ error: error.message || 'Erro ao processar o arquivo enviado.' });
    }
    if (error instanceof ZodError) {
      return res.status(400).json({
        error: 'Dados inválidos',
        details: error.issues.map((issue) => ({ field: issue.path[0], message: issue.message }))
      });
    }
    return res.status(500).json({ error: error.message || 'Erro interno do servidor.' });
  }
});

app.post('/checkout/create-preference', async (req, res) => createCheckoutPreference(req, res));
app.get('/checkout/status', readCheckoutStatus);
app.get('/checkout/payment-notifications', (req, res) => res.status(200).json({ received: true, method: 'GET' }));
app.post('/checkout/payment-notifications', processPaymentNotification);

app.post('/checkout/apoio/create-preference', async (req, res) => createCheckoutPreference(req, res, 'apoio'));
app.get('/checkout/apoio/status', readCheckoutStatus);
app.get('/checkout/apoio/payment-notifications', (req, res) => res.status(200).json({ received: true, method: 'GET' }));
app.post('/checkout/apoio/payment-notifications', processPaymentNotification);

app.use((req, res) => {
  res.status(404).json({ error: 'Rota não encontrada.' });
});

const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, async () => {
  console.log(`Servidor rodando na porta ${PORT}`);

  try {
    await ensureDataFiles();
    setInterval(() => {
      processPendingEmailJobs().catch((error) => console.error('Erro no worker de e-mail:', error));
    }, 30_000);
  } catch (error) {
    console.error('Falha ao preparar estrutura de persistência:', error);
  }

  if (missingMailEnv.length > 0) {
    console.warn(`SMTP desabilitado: variáveis ausentes -> ${missingMailEnv.join(', ')}`);
    smtpVerified = false;
    smtpLastError = `Variáveis ausentes: ${missingMailEnv.join(', ')}`;
    return;
  }

  try {
    await transporter.verify();
    smtpVerified = true;
    smtpLastError = '';
    console.log('SMTP OK: conexão validada com sucesso.');
  } catch (error) {
    smtpVerified = false;
    smtpLastError = error.message || 'Falha ao validar SMTP';
    logMailError('smtp-verify', error);
  }
});
