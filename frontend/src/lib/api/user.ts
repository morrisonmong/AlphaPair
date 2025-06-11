import apiClient from './client';

export interface PasswordUpdatePayload {
  current_password: string;
  new_password: string;
  confirm_password: string;
}

export const updatePassword = async (payload: PasswordUpdatePayload) => {
  const { data } = await apiClient.post('/user/update-password', payload);
  return data;
}; 