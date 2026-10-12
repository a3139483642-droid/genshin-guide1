// Modern Netlify Functions expose deploy-specific values through Netlify.env.
export const env = name => globalThis.Netlify?.env?.get(name) ?? process.env[name];
export const onNetlify = Boolean(globalThis.Netlify?.env || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NETLIFY === 'true');
