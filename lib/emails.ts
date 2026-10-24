// SQL fragment: every verified email address of the user whose id is parameter $n (primary + extra addresses).
export const myEmails = (n: number) => `(select lower(email) from users where id=$${n} union select lower(email) from user_emails where user_id=$${n} and verified)`;
