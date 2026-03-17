export const NETWORKS = {
  MTN:      { id: 'mtn',     vtpassId: 'mtn-data',       name: 'MTN' },
  AIRTEL:   { id: 'airtel',  vtpassId: 'airtel-data',    name: 'Airtel' },
  GLO:      { id: 'glo',     vtpassId: 'glo-data',       name: 'Glo' },
  ETISALAT: { id: '9mobile', vtpassId: 'etisalat-data',  name: '9mobile' },
  SMILE:    { id: 'smile',   vtpassId: 'smile-direct',   name: 'Smile' },
};

export const TX_STATUS = { PENDING: 'pending', SUCCESS: 'success', FAILED: 'failed' };
export const TX_TYPES  = { AIRTIME: 'airtime', DATA: 'data', WALLET_FUND: 'wallet_fund' };