import { defineJsonSecret } from 'firebase-functions/params';

export const paystackConfigSecret = defineJsonSecret('PAYSTACK_CONFIG');
export const appConfigSecret = defineJsonSecret('APP_CONFIG');
export const geminiConfigSecret = defineJsonSecret('GEMINI_CONFIG');

export const getPaystackConfig = () => {
  const config = paystackConfigSecret.value() ?? {};

  return {
    paystackSecretKey: config.secretKey?.trim(),
    paystackBaseUrl: config.baseUrl?.trim() || 'https://api.paystack.co',
    paystackCallbackUrl: config.callbackUrl?.trim(),
  };
};

export const getAppConfig = () => {
  const config = appConfigSecret.value() ?? {};

  return {
    firestoreDatabaseId: config.firestoreDatabaseId?.trim() || '(default)',
  };
};

export const getGeminiConfig = () => {
  const config = geminiConfigSecret.value() ?? {};

  return {
    geminiApiKey: config.apiKey?.trim(),
    geminiModel: config.model?.trim() || 'gemini-1.5-flash',
  };
};