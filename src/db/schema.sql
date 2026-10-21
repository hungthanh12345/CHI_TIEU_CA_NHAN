CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT users_email_length CHECK (char_length(email) BETWEEN 3 AND 254)
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique ON users (lower(email));

CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(40) NOT NULL,
  type VARCHAR(10) NOT NULL CHECK (type IN ('income', 'expense')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT categories_name_nonempty CHECK (length(trim(name)) > 0),
  CONSTRAINT categories_owner_name_type_unique UNIQUE (user_id, name, type),
  CONSTRAINT categories_id_owner_type_unique UNIQUE (id, user_id, type)
);

CREATE INDEX IF NOT EXISTS categories_user_idx ON categories (user_id, type, name);

CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id UUID NOT NULL,
  type VARCHAR(10) NOT NULL CHECK (type IN ('income', 'expense')),
  amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  description VARCHAR(250),
  transaction_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT transactions_category_owner_type_fk
    FOREIGN KEY (category_id, user_id, type)
    REFERENCES categories (id, user_id, type)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS transactions_user_date_idx
  ON transactions (user_id, transaction_date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS transactions_user_category_idx
  ON transactions (user_id, category_id, transaction_date DESC);
