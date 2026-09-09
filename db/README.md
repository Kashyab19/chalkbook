# Database conventions

PostgreSQL is the standalone deployment's source of persistent server data.

- Use lowercase `snake_case` identifiers without quoted mixed-case names.
- Group tables by responsibility: `identity` for authentication, `fitness` for workout data, and `infrastructure` for migration bookkeeping.
- Use descriptive plural table names. Avoid personal names, temporary labels, abbreviations without a clear meaning, and generated novelty names in new migrations.
- Name primary, foreign, unique, and check constraints with `pk_`, `fk_`, `uq_`, and `ck_` prefixes respectively.
- Use `owner_id` foreign keys for private account ownership, `timestamptz` for timestamps, `date` for local calendar dates, and explicit units such as `weight_kg`.
- Qualify table references with their schema. Parameterize all query values.
- Treat applied migrations as immutable. Add a new numbered, descriptive migration for changes; retain checksums and transaction boundaries.
- Preserve existing migration history and data identifiers during migration. Legacy Sites migration names remain only where already established.

`postgres/001_notebook.sql` establishes the standalone schema. Workout and program JSON documents preserve the existing model during migration; their outer types are constrained in SQL and their contents are validated by the shared application validator. This is a deliberate compatibility choice, not full relational normalization.

The runtime database role has data access only to the required tables and cannot create schemas. Administrative migrations run separately from application startup.
