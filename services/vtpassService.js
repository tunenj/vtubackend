import axios from 'axios';

const BASE_URL = process.env.VTPASS_BASE_URL; // https://vtpass.com/api (live) or https://sandbox.vtpass.com/api

const client = axios.create({
  baseURL: BASE_URL,
  auth: {
    username: process.env.VTPASS_USERNAME,
    password: process.env.VTPASS_PASSWORD,
  },
  headers: { 'Content-Type': 'application/json' },
});

// Generate unique request ID
const genRef = () => `VTU-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;

/**
 * Buy airtime for any Nigerian network
 */
export const buyAirtime = async ({ network, phone, amount }) => {
  const ref = genRef();
  const { data } = await client.post('/pay', {
    request_id: ref,
    serviceID:  network,       // mtn, airtel, glo, etisalat
    amount,
    phone,
  });
  return { ref, data };
};

/**
 * Buy data bundle
 */
export const buyData = async ({ network, phone, planId }) => {
  const ref = genRef();
  const { data } = await client.post('/pay', {
    request_id: ref,
    serviceID:       `${network}-data`,   // e.g. "mtn-data"
    billersCode:     phone,
    variation_code:  planId,              // e.g. "mtn-10mb-100"
    phone,
  });
  return { ref, data };
};

/**
 * Fetch available data plans for a network
 */
export const getDataPlans = async (network) => {
  const { data } = await client.get(`/service-variations?serviceID=${network}-data`);
  return data;
};

/**
 * Check a transaction status by request ID
 */
export const queryTransaction = async (requestId) => {
  const { data } = await client.post('/requery', { request_id: requestId });
  return data;
};