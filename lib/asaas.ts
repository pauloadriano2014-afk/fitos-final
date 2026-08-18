// lib/asaas.ts
// Client helper para a API do Asaas
// Fase 1: usa a key do .env (você como único coach)
// Fase 2: passe a apiKey da subconta do coach no construtor

const ASAAS_API_URL = process.env.ASAAS_API_URL || 'https://api-sandbox.asaas.com/v3';
const ASAAS_API_KEY = process.env.ASAAS_API_KEY || '';

interface AsaasRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: any;
  apiKey?: string; // override para multi-tenant (fase 2)
}

async function asaasRequest(endpoint: string, options: AsaasRequestOptions = {}) {
  const { method = 'GET', body, apiKey } = options;

  const response = await fetch(`${ASAAS_API_URL}${endpoint}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      access_token: apiKey || ASAAS_API_KEY,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const errorMsg =
      data?.errors?.[0]?.description || `Asaas API error: ${response.status}`;
    throw new Error(errorMsg);
  }

  return data;
}

// ============ CUSTOMERS ============

export async function findOrCreateCustomer(
  params: {
    name: string;
    cpfCnpj: string;
    email?: string;
    mobilePhone?: string;
    externalReference?: string; // seu userId interno
  },
  apiKey?: string
) {
  // Busca por CPF primeiro para evitar duplicados
  const existing = await asaasRequest(
    `/customers?cpfCnpj=${encodeURIComponent(params.cpfCnpj)}`,
    { apiKey }
  );

  if (existing?.data?.length > 0) {
    return existing.data[0];
  }

  return asaasRequest('/customers', {
    method: 'POST',
    body: params,
    apiKey,
  });
}

// ============ COBRANÇAS AVULSAS ============

export async function createPayment(
  params: {
    customer: string; // asaasCustomerId
    billingType: 'PIX' | 'CREDIT_CARD' | 'BOLETO' | 'UNDEFINED';
    value: number;
    dueDate: string; // 'YYYY-MM-DD'
    description?: string;
    externalReference?: string; // seu paymentId interno
  },
  apiKey?: string
) {
  return asaasRequest('/payments', {
    method: 'POST',
    body: params,
    apiKey,
  });
}

// QR Code PIX de uma cobrança existente
export async function getPixQrCode(paymentId: string, apiKey?: string) {
  // Retorna { encodedImage (base64), payload (copia-e-cola), expirationDate }
  return asaasRequest(`/payments/${paymentId}/pixQrCode`, { apiKey });
}

// ============ ASSINATURAS ============

export async function createSubscription(
  params: {
    customer: string;
    billingType: 'PIX' | 'CREDIT_CARD' | 'BOLETO' | 'UNDEFINED';
    value: number;
    nextDueDate: string; // 'YYYY-MM-DD'
    cycle: 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUALLY' | 'YEARLY';
    description?: string;
    externalReference?: string;
  },
  apiKey?: string
) {
  return asaasRequest('/subscriptions', { method: 'POST', body: params, apiKey });
}

export async function cancelSubscription(subscriptionId: string, apiKey?: string) {
  return asaasRequest(`/subscriptions/${subscriptionId}`, {
    method: 'DELETE',
    apiKey,
  });
}

// Lista cobranças de uma assinatura (a mais recente vem primeiro)
export async function getSubscriptionPayments(subscriptionId: string, apiKey?: string) {
  return asaasRequest(`/subscriptions/${subscriptionId}/payments`, { apiKey });
}

// ============ CONSULTA ============

export async function getPayment(paymentId: string, apiKey?: string) {
  return asaasRequest(`/payments/${paymentId}`, { apiKey });
}

// ============ CHECKOUT (recorrência com cartão salvo) ============
// O Asaas Checkout é uma página HOSPEDADA PELA PRÓPRIA ASAAS: o aluno digita
// os dados do cartão lá, nunca no nosso backend. Isso é proposital — evita
// que a gente precise lidar com dado de cartão bruto (escopo de PCI-DSS
// muito mais pesado do que um dev solo consegue sustentar). Ver conversa/
// memória do projeto pra contexto completo dessa decisão.

export async function createCheckoutSession(
  params: {
    customerData: {
      name: string;
      cpfCnpj: string;
      email?: string;
      phone?: string;
    };
    value: number;
    description: string; // vira o "item" cobrado a cada ciclo
    cycle: 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUALLY' | 'YEARLY';
    nextDueDate: string; // 'YYYY-MM-DD'
    externalReference: string; // "recorrencia:{userId}" — devolvido no webhook
    successUrl: string;
    cancelUrl: string;
    expiredUrl: string;
    minutesToExpire?: number; // default 60 se omitido
  },
  apiKey?: string
) {
  return asaasRequest('/checkouts', {
    method: 'POST',
    body: {
      billingTypes: ['CREDIT_CARD'],
      chargeTypes: ['RECURRENT'],
      minutesToExpire: params.minutesToExpire ?? 60,
      externalReference: params.externalReference,
      customerData: params.customerData,
      items: [
        {
          name: params.description,
          description: params.description,
          value: params.value,
          quantity: 1,
        },
      ],
      subscription: {
        cycle: params.cycle,
        nextDueDate: params.nextDueDate,
      },
      callback: {
        successUrl: params.successUrl,
        cancelUrl: params.cancelUrl,
        expiredUrl: params.expiredUrl,
      },
    },
    apiKey,
  });
}

export async function cancelCheckout(checkoutId: string, apiKey?: string) {
  return asaasRequest(`/checkouts/${checkoutId}/cancel`, { method: 'POST', apiKey });
}