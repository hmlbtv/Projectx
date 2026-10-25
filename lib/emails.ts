// SQL fragment: the email address of the user whose id is parameter $n. Walls are shared with a person's own account address only.
export const myEmails = (n: number) => `(select lower(email) from users where id=$${n})`;
