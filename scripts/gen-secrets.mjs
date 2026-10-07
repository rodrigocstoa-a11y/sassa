#!/usr/bin/env node
/**
 * Gera valores aleatórios seguros para o ambiente de teste (staging) / produção.
 * Roda 100% local (sem internet). NADA é gravado em arquivo: copie os valores direto para o painel do
 * Railway (campo de variáveis) e nunca os cole em chats, e-mails ou no Git.
 *
 *   node scripts/gen-secrets.mjs
 */
import { randomBytes, randomInt } from 'node:crypto';

const appSecret = randomBytes(48).toString('base64url'); // 64 caracteres

// Senha forte e fácil de digitar: 5 grupos de 4 caracteres sem símbolos ambíguos (sem 0/O, 1/l/I)
const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const group = () => Array.from({ length: 4 }, () => alphabet[randomInt(alphabet.length)]).join('');
const suggestedPassword = Array.from({ length: 5 }, group).join('-'); // 24 caracteres

console.log('\nCopie estes valores para as variáveis do serviço "api" no Railway:\n');
console.log(`APP_SECRET=${appSecret}`);
console.log(`ADMIN_PASSWORD=${suggestedPassword}   # sugestão; você pode escolher outra com 12+ caracteres`);
console.log('\nLembretes: ADMIN_EMAIL é o seu e-mail de login. Guarde a senha em um gerenciador de senhas.');
console.log('Estes valores não foram salvos em lugar nenhum; se perder, gere novos (a senha do admin pode ser trocada alterando a variável).\n');
