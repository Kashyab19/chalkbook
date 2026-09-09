CREATE SCHEMA IF NOT EXISTS identity;
CREATE SCHEMA IF NOT EXISTS fitness;

CREATE TABLE identity.accounts (
  id uuid CONSTRAINT pk_accounts PRIMARY KEY,
  username text NOT NULL CONSTRAINT uq_accounts_username UNIQUE,
  password_hash text NOT NULL,
  disabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_accounts_username CHECK (username ~ '^[a-z0-9._-]{1,50}$')
);
CREATE TABLE fitness.training_programs (
  owner_id uuid CONSTRAINT pk_training_programs PRIMARY KEY,
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_training_programs_owner FOREIGN KEY(owner_id) REFERENCES identity.accounts(id),
  CONSTRAINT ck_training_programs_data CHECK (jsonb_typeof(data) = 'array')
);
CREATE TABLE fitness.workout_sessions (
  owner_id uuid NOT NULL,
  id text NOT NULL,
  date date NOT NULL,
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_workout_sessions PRIMARY KEY(owner_id,id),
  CONSTRAINT fk_workout_sessions_owner FOREIGN KEY(owner_id) REFERENCES identity.accounts(id),
  CONSTRAINT ck_workout_sessions_data CHECK (jsonb_typeof(data) = 'object')
);
CREATE TABLE fitness.body_weight_entries (
  owner_id uuid NOT NULL,
  date date NOT NULL,
  weight_kg double precision NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_body_weight_entries PRIMARY KEY(owner_id,date),
  CONSTRAINT fk_body_weight_entries_owner FOREIGN KEY(owner_id) REFERENCES identity.accounts(id),
  CONSTRAINT ck_body_weight_entries_weight CHECK (weight_kg >= 1 AND weight_kg <= 500)
);
CREATE TABLE fitness.sync_operations (
  owner_id uuid NOT NULL,
  id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_sync_operations PRIMARY KEY(owner_id,id),
  CONSTRAINT fk_sync_operations_owner FOREIGN KEY(owner_id) REFERENCES identity.accounts(id)
);
CREATE TABLE identity.sessions (
  token_hash text CONSTRAINT pk_identity_sessions PRIMARY KEY,
  owner_id uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  CONSTRAINT fk_identity_sessions_owner FOREIGN KEY(owner_id) REFERENCES identity.accounts(id)
);
CREATE TABLE identity.login_attempts (
  username text CONSTRAINT pk_login_attempts PRIMARY KEY,
  attempts integer NOT NULL,
  reset_at timestamptz NOT NULL,
  CONSTRAINT ck_login_attempts_count CHECK (attempts > 0)
);
