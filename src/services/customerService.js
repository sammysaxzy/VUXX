import { api } from "../api/client.js";

export const PLAN_TIERS = ["Home 40Mbps", "Biz 60Mbps", "Biz 100Mbps", "Enterprise 200Mbps"];
export const ACCOUNT_STATUSES = ["active", "suspended"];
export const PAYMENT_STATUSES = ["paid", "overdue"];

function parseResponse(res) {
  return res.data;
}

export function fetchCustomers() {
  return api.get("/api/customers").then(parseResponse);
}

export function createCustomer(payload) {
  return api.post("/api/customers", payload).then(parseResponse);
}

export function updateCustomer(customerId, payload) {
  return api.patch(`/api/customers/${customerId}`, payload).then(parseResponse);
}

export function updateCustomerStatus(customerId, accountStatus) {
  return api.patch(`/api/customers/${customerId}/status`, { accountStatus }).then(parseResponse);
}

export function updateCustomerPlan(customerId, plan) {
  return api.patch(`/api/customers/${customerId}/plan`, { plan }).then(parseResponse);
}
