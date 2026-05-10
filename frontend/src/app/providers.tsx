'use client';
import { ApolloClient, InMemoryCache, ApolloProvider, HttpLink } from '@apollo/client';
import { setContext } from '@apollo/client/link/context';
import { CompanyProvider } from '@/contexts/CompanyContext';
import { AuthProvider } from '@/contexts/AuthContext';

const httpLink = new HttpLink({
  uri: `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/graphql`,
});

const authLink = setContext((_, { headers }) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('aura_token') : null;
  return {
    headers: {
      ...headers,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  };
});

const client = new ApolloClient({
  link: authLink.concat(httpLink),
  cache: new InMemoryCache({
    typePolicies: {
      Query: {
        fields: {
          // Listas paginadas: merge correto
          notifications: { merge: false },
          honorarios: { merge: false },
          tarefasKanban: { merge: false },
          crmPipeline: { merge: false },
          meiApuracoes: { merge: false },
          comunicados: { merge: false },
          aberturas: { merge: false },
        },
      },
    },
  }),
  defaultOptions: {
    watchQuery: {
      fetchPolicy: 'cache-and-network',  // mostra cache imediato, atualiza em background
      errorPolicy: 'all',
    },
    query: {
      fetchPolicy: 'cache-first',
      errorPolicy: 'all',
    },
  },
  connectToDevTools: process.env.NODE_ENV === 'development',
});

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <CompanyProvider>
        <ApolloProvider client={client}>
          {children}
        </ApolloProvider>
      </CompanyProvider>
    </AuthProvider>
  );
}
