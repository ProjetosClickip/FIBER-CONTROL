/* ClickIP FiberControl — configuração do ambiente hospedado (GitHub Pages)
 * Preencha com os dados do seu projeto Supabase (Project Settings › API) e faça o commit.
 * Assim toda a equipe já abre o sistema conectado ao banco, sem configurar nada no navegador.
 *
 * A chave "anon public" é pública por desenho: a proteção dos dados está nas políticas RLS do schema.sql.
 * NUNCA coloque aqui a chave service_role nem segredos do Google.
 */
window.FC_CONFIG = {
  supabaseUrl: 'https://zegtrlzyfdydbsmymehi.supabase.co',      // ex.: 'https://abcdefghijkl.supabase.co'
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InplZ3RybHp5ZmR5ZGJzbXltZWhpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM5MTI0ODAsImV4cCI6MjEwOTQ4ODQ4MH0._lG4GMLmrS-3oGQKej0wgPvltSDKmgKd1_NnBsSwV1c',  // ex.: 'eyJhbGciOi...'
  driveBackendUrl: ''   // opcional: 'https://abcdefghijkl.supabase.co/functions/v1/drive'
};
