CREATE TABLE fitness.push_subscriptions (
  endpoint text CONSTRAINT pk_push_subscriptions PRIMARY KEY,
  owner_id uuid NOT NULL,
  p256dh text NOT NULL,
  auth_secret text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_push_subscriptions_owner FOREIGN KEY(owner_id) REFERENCES identity.accounts(id),
  CONSTRAINT ck_push_subscriptions_endpoint CHECK (endpoint LIKE 'https://%')
);
CREATE TABLE fitness.rest_alarms (
  owner_id uuid CONSTRAINT pk_rest_alarms PRIMARY KEY,
  ends_at timestamptz NOT NULL,
  held boolean NOT NULL,
  token uuid NOT NULL,
  state text NOT NULL,
  CONSTRAINT fk_rest_alarms_owner FOREIGN KEY(owner_id) REFERENCES identity.accounts(id),
  CONSTRAINT ck_rest_alarms_state CHECK (state IN ('scheduled', 'sending', 'sent', 'cancelled'))
);
