/**
 * Papéis de usuário na plataforma LINKA (PRD §4).
 * O isolamento real entre clientes é garantido no banco (RLS); estes papéis
 * definem o que cada pessoa pode ver/fazer dentro do escopo a que tem acesso.
 */
export const USER_ROLES = ["superadmin", "agency", "client", "field"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const ROLE_LABELS: Record<UserRole, string> = {
  superadmin: "Operador LINKA",
  agency: "Agência",
  client: "Cliente",
  field: "Campo",
};
