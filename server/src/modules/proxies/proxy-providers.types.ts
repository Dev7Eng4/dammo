export interface ProxyProvider {
  id: string;
  name: string;
  loginUrl?: string;
  username: string;
  password: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProxyProvidersStore {
  providers: ProxyProvider[];
}

export interface CreateProxyProviderInput {
  name: string;
  loginUrl?: string;
  username: string;
  password: string;
  notes?: string;
}

export interface UpdateProxyProviderInput {
  name?: string;
  loginUrl?: string;
  username?: string;
  password?: string;
  notes?: string | null;
}
