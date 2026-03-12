# Architektura systemu

> Tento dokument popisuje technickou architekturu Czech B2B Email Outreach systemu.
> **Cast 1** obsahuje rychly prehled. **Cast 2** je detailni reference.

---

## Navigace

| Jsem... | Chci... | Prejdete na... |
|---------|---------|----------------|
| Novy clen tymu | Pochopit, jak system funguje | [Prehled systemu](#cast-1--rychly-prehled) |
| Vyvojar | Videt architekturu a komponenty | [Diagram](#diagram-architektury), [Komponenty](#komponenty) |
| Vyvojar | Najit konkretni workflow | [Reference workflow](#reference-workflow) |
| Spravce DB | Videt databazove schema | [Databazove schema](#databazove-schema) |
| Kdokoliv | Vysvetleni technickych pojmu | [Slovnicek](#slovnicek) |

---

# Cast 1 — Rychly prehled

## Co system dela

System automatizuje B2B cold email outreach na ceskem trhu. Cely proces:

1. **Nacte firmy** (CSV import nebo rucni pridani) s ruznou urovni enrichmentu (`import_only`, `find_emails`, `full_pipeline`)
2. **Obohati data** — ARES (ICO lookup), kurzy.cz (jednatele), generovani emailu, verifikace (Seznam, QEV)
3. **Naplani vlny** — prirazeni leadu do vln, planovani odeslani
4. **Odesle emaily** — pres SMTP proxy s korektnim threadingem (Message-ID, In-Reply-To, References)
5. **Detekuje odpovedi** — IMAP proxy + NDR monitoring, automaticke prirazeni k leadum

Cely pipeline je rizen 26+ n8n workflow, data jsou v Supabase (PostgreSQL) a uzivatelske rozhrani je React SPA.

## Ctyri hlavni komponenty

| Komponenta | Technologie | Ucel |
|---|---|---|
| **n8n** | Self-hosted na Hostinger VPS | Orchestrace vsech workflow (enrichment, odesilani, detekce odpovedi) |
| **Supabase** | Hostovana PostgreSQL + Auth + Realtime | Databaze, autentizace, Row Level Security, realtime subscriptions |
| **React UI** | React 19 + Vite + TailwindCSS | Webove rozhrani pro spravu firem, leadu, vln, sablon a nastaveni |
| **Docker proxy** | Node.js mikro-servisy (IMAP + SMTP) | Reseni omezenych moznosti n8n pro email (threading, \Seen flag) |

---

# Cast 2 — Detailni reference

## Diagram architektury

```
                         +-----------------------+
                         |     React UI (SPA)    |
                         |  Vite + TailwindCSS   |
                         |  deploy: VPS static   |
                         +-----------+-----------+
                                     |
                            Supabase JS SDK
                                     |
              +----------------------+----------------------+
              |                                             |
   +----------v----------+                     +------------v-----------+
   |      Supabase        |                     |         n8n            |
   |  - PostgreSQL DB     |<--- HTTP/REST ----->|  - 26+ workflow        |
   |  - Auth (JWT)        |                     |  - Cron + Webhook      |
   |  - Realtime          |                     |  - Self-hosted VPS     |
   |  - Row Level Sec.    |                     +--+------------------+--+
   +----------------------+                        |                  |
                                                   |                  |
                                        +----------v---+    +---------v------+
                                        | IMAP Proxy   |    | SMTP Proxy     |
                                        | port 3001    |    | port 3002      |
                                        | imapflow     |    | nodemailer     |
                                        | BODY.PEEK[]  |    | threading hdr  |
                                        +--------------+    +----------------+
                                               |                   |
                                        +------v---+        +------v---+
                                        | Mailbox  |        |  SMTP    |
                                        | (IMAP)   |        |  Server  |
                                        +----------+        +----------+
```

## Komponenty

### n8n (Orchestrace)

Self-hosted na Hostinger VPS. Vsechny workflow jsou ulozeny jako JSON v `n8n-workflows/` a spravovany pres API.

**Klicova pravidla:**
- Zadne `$env.*` promenne — Supabase URL/key hardcoded v JSON (bezpecne, bezi na VPS)
- Code node nema pristup k `fetch` ani `require('https')` — externi volani vzdy pres HTTP Request node
- Webhook nody musi mit `webhookId` field shodny s `path`
- emailSend v2.1 nepodporuje custom headers — proto existuje SMTP proxy

### Supabase (Databaze + Auth)

- **23 tabulek** (viz [Databazove schema](#databazove-schema))
- Autentizace pres Supabase Auth (JWT tokeny)
- Row Level Security (RLS) na vsech tabulkach
- Realtime subscriptions pro live aktualizace v UI
- `config` tabulka pro runtime secrets (seznam_from_email, qev_api_key_1/2/3)

### React UI

**Tech stack:**
- React 19 + TypeScript 5.9
- Vite 7 (build + dev server)
- TailwindCSS 3 + tailwindcss-animate
- Radix UI primitives (dialog, dropdown, tabs, toast, tooltip, atd.)
- TanStack React Query 5 (server state management)
- Recharts 3 (grafy na dashboardu)
- Tiptap 3 (WYSIWYG editor pro sablony)
- dnd-kit (drag & drop pro razeni sablon)
- date-fns 4 (formatovani dat)
- sonner 2 (toast notifikace)
- cmdk (command palette)
- DOMPurify (sanitizace HTML)
- Lucide React (ikony)

**Deploy:** `npm run build` + `node deploy-ssh2.mjs` (SCP na VPS pres SSH)

#### Routes

| Cesta | Stranka | Pristup | Popis |
|---|---|---|---|
| `/prehled` | DashboardPage | Vsichni | Hlavni dashboard se statistikami (podporuje casove filtrovani 7d/30d/all) |
| `/databaze` | DatabasePage | Vsichni | Seznam firem (master CRM) s CSV importem (podporuje enrichment levels) |
| `/databaze/:id` | CompanyDetailPage | Vsichni | Detail firmy — kontakty, leady, tagy |
| `/leady` | LeadsPage | Vsichni | Seznam leadu (email outreach vrstva) |
| `/leady/:id` | LeadDetailPage | Vsichni | Detail leadu — historie emailu, enrichment log |
| `/vlny` | WavesPage | Vsichni | Seznam vln s planovacim reportem |
| `/vlny/:id` | WaveDetailPage | Vsichni | Detail vlny — odeslane, neuspesne emaily s retry |
| `/sablony` | TemplateSetEditor | Vsichni | Sprava sad sablon (drag & drop razeni) |
| `/sablony/:id` | TemplateSetDetailPage | Vsichni | Detail sady sablon — WYSIWYG editor |
| `/retarget` | RetargetPoolPage | Vsichni | Pool leadu pro retargeting |
| `/email-finder` | EmailFinderPage | Admin | Hledani emailu s bulk rezimem a historii v localStorage |
| `/system` | SystemHealthPage | Admin | Stav systemu — zdravi workflow, proxy, DB |
| `/nastaveni/*` | SettingsPage | Admin | Nastaveni (vnorene routy nize) |
| `/nastaveni/tymy` | TeamsSettings | Admin | Sprava tymu (daily_send_limit, retarget_lockout_days) |
| `/nastaveni/obchodnici` | SalesmenSettings | Admin | Sprava obchodniku |
| `/nastaveni/uzivatele` | UsersSettings | Admin | Sprava uzivatelu |
| `/nastaveni/ucty` | OutreachAccountsSettings | Admin | Outreach ucty (SMTP/IMAP) |
| `/nastaveni/api-klice` | ApiKeysSettings | Admin | Sprava API klicu (QEV, atd.) |
| `/login` | LoginPage | Verejne | Prihlaseni |

#### Hooks

| Hook | Soubor | Ucel |
|---|---|---|
| `useAuth` | `useAuth.ts` | Autentizace — prihlaseni, odhlaseni, session |
| `useCompanies` | `useCompanies.ts` | CRUD operace nad firmami |
| `useContacts` | `useContacts.ts` | CRUD operace nad kontakty (nahrazuje jednatels) |
| `useDashboard` | `useDashboard.ts` | Statistiky dashboardu (get_dashboard_stats RPC, casove rozsahy) |
| `useForceSend` | `useForceSend.ts` | Vynucene odeslani emailu mimo frontu |
| `useLeads` | `useLeads.ts` | CRUD operace nad leady |
| `useMasterLeads` | `useMasterLeads.ts` | Master lead data (propojeni s companies) |
| `useMobile` | `useMobile.ts` | Detekce mobilniho zarizeni |
| `useMobileNav` | `useMobileNav.tsx` | Mobilni navigace |
| `useRealtime` | `useRealtime.ts` | Supabase realtime subscriptions |
| `useRetargetPool` | `useRetargetPool.ts` | Data pro retarget pool |
| `useSettings` | `useSettings.ts` | Nastaveni aplikace |
| `useTags` | `useTags.ts` | Sprava tagu (pro firmy i leady) |
| `useUsers` | `useUsers.ts` | Sprava uzivatelu |
| `useWaves` | `useWaves.ts` | CRUD operace nad vlnami |

#### Dalsi UI vlastnosti

- **CSV import** podporuje urovne enrichmentu: `import_only` (pouze import), `find_emails` (najdi emaily), `full_pipeline` (kompletni obohaceni)
- **AddLead dialog** podporuje volbu enrichmentu
- **Email Finder** ma zakladku pro bulk rezim a historii ulozenou v localStorage
- **StatusBadge** zobrazuje ikony vedle barev
- **Error toasty** maji delsi trvani (8s default, Infinity pro kriticke chyby)
- **Dashboard** podporuje casove filtrovani (7d / 30d / all)
- **Wave detail** zobrazuje neuspesne emaily s moznosti retry
- **format.ts** utility pro ceske formatovani dat

### IMAP Proxy

**Umisteni:** `imap-proxy/` | **Port:** 3001 (127.0.0.1 only) | **Docker**

**Proc existuje:** n8n emailReadImap oznacuje emaily jako `\Seen` navzdory workaroundum a zaroven zpusobuje IMAP connection leaky.

**Technologie:** Node.js + imapflow + mailparser

**API:**
- `POST /check-inbox` — `{ "credential_name": "Salesman IMAP 1" }` → `{ success, emails: [...] }`
- `GET /health` → `{ "status": "ok" }`

**Bezpecnost:**
- Bearer token autentizace (`PROXY_AUTH_TOKEN`)
- Rate limiting (60 req/min na IP, sliding window)
- Max body size: 1 MB
- Pristupne pouze z lokalni site (127.0.0.1)

**Konfigurace:** `config.json` (gitignored) — IMAP credentials dle slot name. Pridani obchodnika = nova polozka v `config.json` → `docker restart imap-proxy`.

### SMTP Proxy

**Umisteni:** `smtp-proxy/` | **Port:** 3002 (127.0.0.1 only) | **Docker**

**Proc existuje:** n8n emailSend/betterEmailSend neumoznuje nastavit threading hlavicky (nodemailer prepisuje chranene hlavicky).

**Technologie:** Node.js + nodemailer

**API:**
- `POST /send-email` — `{ credential_name, from, to, subject, html, replyTo, messageId, inReplyTo, references }` → `{ success, messageId, response }`
- `GET /health` → `{ "status": "ok" }`

**Bezpecnost:**
- Bearer token autentizace (`PROXY_AUTH_TOKEN`)
- Rate limiting (120 req/min na IP, sliding window)
- Max body size: 1 MB
- Pristupne pouze z lokalni site (127.0.0.1)

**Konfigurace:** `config.json` (gitignored) — SMTP credentials dle credential name. Transporter instance kesirovany s 30min TTL.

**Threading:** Pouziva nodemailer's dedicated `messageId`, `inReplyTo`, `references` mail options (NE headers objekt).

---

## Datove toky

### 1. Enrichment pipeline

```
CSV import / AddLead dialog (s volbou enrichment level)
        |
        v
   WF1: Lead Ingest (webhook:lead-ingest)
   - Vytvori/najde company → vytvori lead
   - ingest_lead() RPC
        |
        v
   WF2: ARES Lookup (webhook:wf2-ares)
   - ICO → nazev firmy, adresa, pravni forma
   - Vola BE i VR endpoint (merge jednatelu)
        |
        v
   WF3: Kurzy Scrape (webhook:wf3-kurzy)
   - Scraping jednatelu z kurzy.cz
   - Uklada do contacts tabulky
        |
        v
   WF4: Email Gen (webhook:wf4-email-gen)
   - Generuje emailove adresy z jmena + domeny
   - Uklada do email_candidates
        |
        v
   WF5: Seznam Verify (webhook:wf5-seznam)
   - Overeni pres Seznam (zda email existuje)
   - Nacita seznam_from_email z config tabulky
        |
        v
   WF6: QEV Verify (webhook:wf6-qev)
   - Quick Email Verification API
   - 3 rotujici API klice z config tabulky
        |
        v
   Lead je pripraven k odesilani (status: ready)
```

**Doplnkove enrichment workflow:**
- **WF11: Website Fallback** — kdyz ARES nenajde domain, pokusi se ji ziskat z webu
- **WF12: ICO Scrape** — scraping ICO z webovych stranek
- **wf-email-finder / v2** — samostatny nastroj pro hledani emailu (pouziva se z EmailFinderPage)

### 2. Sending pipeline

```
   WF7: Wave Schedule (webhook:wf7-wave-schedule)
   - Prirazeni leadu do vlny → email_queue
   - Tracking preskacenych leadu v scheduling_report
   - Ulozi scheduling_report do waves tabulky
        |
        v
   WF8: Send Cron (cron:every-5min)
   - claim_queued_emails() — atomicke prevzeti emailu z fronty
   - increment_and_check_sends(team_id) — kontrola dennich limitu
   - Odeslani pres SMTP proxy s threading hlavickami
   - Vylepseny null guard pro threading
   - Po dokonceni: auto_complete_waves()
        |
        v
   WF9: Reply Detection (cron:every-1min)
   - Cteni odpovedi pres IMAP proxy
   - Prirazeni k leadum pres handle_lead_reply() trigger
        |
        v
   WF10: Daily Reset (cron:midnight)
   - reset_daily_sends() — vynulovani teams.sends_today
   - Mazani starych email_probe_bounces
```

**Doplnkove odesilaci workflow:**
- **wf-force-send** — vynucene odeslani mimo standardni frontu
- **wf-ndr-monitor** — monitoring NDR (bounce) zprav z INBOX
- **wf-ndr-monitor-spam** — monitoring NDR ze spam slozky
- **sub-smtp-check** — sub-workflow pro kontrolu SMTP
- **sub-burner-probe** — sub-workflow pro probe testovani
- **sub-reply-check** — sub-workflow pro kontrolu odpovedi

### 3. Doplnkove workflow

- **WF13: GSheet Proxy** — proxy pro Google Sheets integraci
- **email-verification sub-wf** — sdileny sub-workflow pro overeni emailu
- **wf-verify-wave** — overeni vsech emailu ve vlne
- **backfill-salutations** — hromadne doplneni oslovovani (vokativ)
- **wf-admin-users** — sprava uzivatelu (admin API)

---

## Reference workflow

Kompletni seznam vsech n8n workflow s identifikatory:

| Workflow | n8n ID | Trigger | Popis |
|---|---|---|---|
| wf1-lead-ingest | beB84wDnEG2soY1m | webhook:lead-ingest | Prijem a vytvoreni leadu (ingest_lead RPC) |
| wf2-ares-lookup | 2i6zvyAy3j7BjaZE | webhook:wf2-ares | ARES ICO lookup (BE + VR endpoint) |
| wf3-kurzy-scrape | nPbr15LJxGaZUqo7 | webhook:wf3-kurzy | Scraping jednatelu z kurzy.cz |
| wf4-email-gen | RNuSFAtwoEAkb9rA | webhook:wf4-email-gen | Generovani emailovych adres |
| wf5-seznam-verify | 7JzGHAG24ra3977B | webhook:wf5-seznam | Overeni emailu pres Seznam |
| wf6-qev-verify | EbKgRSRr2Poe34vH | webhook:wf6-qev | Overeni emailu pres QEV API |
| wf7-wave-schedule | TVNOzjSnaWrmTlqw | webhook:wf7-wave-schedule | Planovani vlny + scheduling_report |
| wf8-send-cron | wJLD5sFxddNNxR7p | cron:every-5min | Odesilani emailu z fronty |
| wf9-reply-detection | AaHXknYh9egPDxcG | cron:every-1min | Detekce odpovedi pres IMAP proxy |
| wf10-daily-reset | 50Odnt5vzIMfSBZE | cron:midnight | Reset dennich pocitadel + cisteni |
| wf11-website-fallback | E5QzxzZe4JbSv5lU | webhook:wf11-website-fallback | Fallback ziskani domeny z webu |
| wf12-ico-scrape | LGEe4MTELj5lmOFX | webhook:wf12-ico-scrape | Scraping ICO z webovych stranek |
| wf13-gsheet-proxy | ENcE8iMWLNwIPc5a | webhook:gsheet-proxy | Google Sheets proxy |
| email-verification sub-wf | Aov5PfwmBDv51L0e | executeWorkflowTrigger | Sdileny sub-workflow pro overeni emailu |
| wf-verify-wave | ttKdYcbucijqiaSp | — | Overeni vsech emailu ve vlne |
| wf-email-finder | N3cuyKRHS4wEyOwq | webhook:wf-email-finder | Email finder v1 |
| wf-email-finder-v2 | 6sc6c0ZSuglJ548A | webhook:wf-email-finder-v2 | Email finder v2 (bulk rezim) |
| wf-ndr-monitor | xMPbk9HwSRGjBbdq | IMAP-trigger:INBOX | NDR monitoring — INBOX |
| wf-ndr-monitor-spam | RxeW59ubWwOsDRqx | IMAP-trigger:spam | NDR monitoring — spam |
| sub-smtp-check | L6D2HcFYoNorgiom | executeWorkflowTrigger | Sub-workflow: SMTP kontrola |
| sub-burner-probe | 9J5svDvgXBkZtOLX | webhook:sub-burner-probe | Sub-workflow: burner probe test |
| sub-reply-check | WjbYMqMXDxkjIssL | executeWorkflowTrigger | Sub-workflow: kontrola odpovedi |
| backfill-salutations | xbJfPwwNRIBtFtAX | webhook:backfill-salutations | Hromadne doplneni oslovovani |
| wf-force-send | DPmnV2dRsbBMLAmz | webhook:wf-force-send | Vynucene odeslani emailu |
| wf-admin-users | JeP8whw3jNtL6VJ1 | webhook:admin-users | Admin sprava uzivatelu |

---

## Databazove schema

### Tabulky

#### Hlavni entity

| Tabulka | Popis | Klicove sloupce |
|---|---|---|
| `teams` | Tymy (organizace) | id, daily_send_limit, sends_today, salesman_email, retarget_lockout_days |
| `outreach_accounts` | Outreach ucty (1 na tym, UNIQUE team_id) | id, team_id, smtp/imap konfigurace |
| `companies` | **Master CRM** — vsechny firmy | id, company_name, ico, website, domain, master_status, team_id, created_at, updated_at |
| `leads` | **Email outreach vrstva** — navazano na companies | id, company_id (FK → companies), status, team_id |
| `contacts` | Kontaktni osoby firem (nahrazuje jednatels) | id, company_id (FK → companies), full_name, first_name, last_name, salutation, role, phone, linkedin, other_contact, notes, created_at, updated_at |
| `jednatels` | **Deprecated** — zachovano pro zpetnou kompatibilitu | Stejna UUID jako contacts |
| `salesmen` | Obchodnici | id, jmeno, email, team_id |
| `profiles` | Uzivatelske profily (Supabase Auth) | id, role (admin/user) |

#### Emailove entity

| Tabulka | Popis |
|---|---|
| `email_candidates` | Vygenerovane emailove adresy (ma jednatel_id i contact_id) |
| `email_verifications` | Vysledky overeni emailu |
| `email_probe_bounces` | Zaznamy bounce testu |
| `email_queue` | Fronta emailu k odeslani |
| `sent_emails` | Odeslane emaily |

#### Vlny a sablony

| Tabulka | Popis |
|---|---|
| `waves` | Vlny odesilani (from_email, scheduling_report) |
| `wave_leads` | Prirazeni leadu do vln |
| `template_sets` | Sady sablon |
| `email_templates` | Jednotlive sablony (sequence v ramci sady) |

#### Odpovedi

| Tabulka | Popis |
|---|---|
| `lead_replies` | Odpovedi prirazene k leadum |
| `processed_reply_emails` | Zpracovane emaily odpovedi (deduplikace) |
| `unmatched_replies` | Odpovedi, ktere se nepodarilo prirazit |

#### Konfigurace a tagy

| Tabulka | Popis |
|---|---|
| `config` | Key/value konfigurace (seznam_from_email, qev_api_key_1/2/3) |
| `tags` | Definice tagu |
| `lead_tags` | Prirazeni tagu k leadum |
| `company_tags` | Prirazeni tagu k firmam (company_id, tag_id) |
| `enrichment_log` | Log enrichment kroku |

### Dvouvrstva architektura

```
+-------------------+           +-------------------+
|    companies      |           |     contacts      |
|  (Master CRM)     |<---------| (kontaktni osoby) |
|                   |  1:N      |                   |
|  ico, domain,     |           |  full_name,       |
|  master_status    |           |  salutation,      |
|  team_id          |           |  role, notes      |
+--------+----------+           +-------------------+
         |
         | 1:N
         |
+--------v----------+
|      leads         |
| (email outreach)   |
|                    |
|  company_id (FK)   |
|  status, team_id   |
+--------------------+
```

- **`companies`** = Master CRM, zobrazeno na `/databaze`. Unikatni indexy na `ico` (WHERE NOT NULL) a `domain` (WHERE NOT NULL).
- **`leads`** = Email outreach vrstva, zobrazeno na `/leady`. Kazdy lead patri jedne firme.
- **`contacts`** = Kontaktni osoby (nahrazuji tabulku `jednatels`). Stejna UUID pro zpetnou kompatibilitu.

### DB funkce

| Funkce | Popis |
|---|---|
| `ingest_lead()` | Vytvori/najde company, pak vytvori lead |
| `reset_daily_sends()` | Resetuje `teams.sends_today` na 0 |
| `handle_lead_reply()` | Trigger pri vlozeni odpovedi — aktualizuje lead status |
| `get_dashboard_stats()` | Statistiky pro dashboard (podporuje casove rozsahy) |
| `claim_queued_emails()` | Atomicke prevzeti emailu z fronty (WF8) |
| `increment_and_check_sends(p_team_id)` | Inkrementuje `teams.sends_today`, kontroluje limit |
| `get_contacts_for_lead()` | Kontakty pro lead (pres leads.company_id) |
| `get_contacts_for_company()` | Kontakty pro firmu |
| `get_jednatels_for_lead()` | Wrapper — cte z contacts pres leads.company_id |
| `check_email_cache()` | Kontrola cache overeni emailu |
| `mark_contacts_email_status()` | Oznaceni stavu emailu kontaktu |
| `mark_jednatels_email_status()` | Oznaceni stavu emailu jednatelu (compat) |
| `check_max_salesmen()` | Kontrola max poctu obchodniku |
| `parse_full_name()` | Parsovani celeho jmena na casti |
| `generate_salutation()` | Generovani oslovovani (cesky vokativ) |
| `backfill_salutations()` | Hromadne doplneni — iteruje contacts + jednatels |
| `check_and_mark_reply_processed()` | Oznaceni odpovedi jako zpracovane (deduplikace) |
| `auto_complete_waves()` | Automaticke dokonceni vln po odeslani vsech emailu |
| `reorder_template_sequences()` | Prerazeni sekvenci sablon |

### DB triggery

| Trigger | Tabulka | Popis |
|---|---|---|
| `trg_auto_salutation` | `jednatels`, `contacts` | Pri INSERT/UPDATE vzdy re-derivuje `first_name`/`last_name` z `full_name` a regeneruje `salutation` (cesky vokativ). `full_name` je jediny zdroj pravdy. Vsechna muzska jmena se sklonovani bez vyjimek. |
| `trg_refresh_salutations_on_wave_add` | `wave_leads` | Po INSERT touchne `contacts.updated_at` (pres leads.company_id) a `jednatels.updated_at`, cimz spusti `trg_auto_salutation` pro cerstve oslovovani. |

### Vokativni pravidla (ceska jmena)

System automaticky generuje formalni oslovovani ve vokativu:
- **Muzi:** `Vazeny pane Novaku`
- **Zeny:** `Vazena pani Novakova`

Sablony pouzivaji `{{salutation}},` primo — zadny prefix v sablone.

Pravidla inflexe (v poradi priority):

| Pravidlo | Priklad |
|---|---|
| Adjektivni typ (-sky, -cky, atd.) | beze zmeny |
| -ek → -ku | Novacek → Novacku |
| -ec → -ce | Nemec → Nemce |
| -el → -le | Havel → Havle |
| -a → -o | Skala → Skalo |
| Digrafy th/ph/gh | + e |
| -k / -h / -g | + u |
| Mekke souhlasky | + i |
| Ostatni souhlasky (vcetne w/x/q) | + e |

Vsechna muzska jmena se sklonovani — zadna vyjimka pro cizi jmena.

---

## Model zabezpeceni

### Autentizace

- **Supabase Auth** s JWT tokeny
- Prihlaseni pres email/heslo na `/login`
- Session management v `useAuth` hooku
- Role: `admin` a `user` (v tabulce `profiles`)

### Autorizace

- **Row Level Security (RLS)** na vsech Supabase tabulkach
- **AdminRoute** komponenta v UI — chrani admin stranky (`/email-finder`, `/system`, `/nastaveni/*`)
- Team-based data isolation

### Proxy bezpecnost

- Oba proxy (IMAP + SMTP) naslouchaji pouze na `127.0.0.1` — nepristupne z internetu
- Bearer token autentizace (`PROXY_AUTH_TOKEN` env variable)
- Rate limiting (IMAP: 60 req/min, SMTP: 120 req/min)
- Maximalni velikost pozadavku: 1 MB

### Sprava secrets

- Zadne hardcoded secrets v kodu
- `.env.local` pro lokalni vyvoj (gitignored)
- `config` tabulka v Supabase pro runtime secrets (QEV klice, Seznam email)
- Proxy `config.json` na VPS (gitignored)
- n8n credentials spravovany v n8n (ne v workflow JSON)

### Email bezpecnost

- **Zadna n8n atribuce** — vsechny odchozi emaily bez "Sent via n8n" / "Powered by n8n"
- `appendAttribution: false` na kazdem emailSend nodu
- Reply-To nastaven na `salesman_email` z `teams` tabulky

---

## Slovnicek

| Pojem | Vysvetleni |
|---|---|
| **ARES** | Administrativni registr ekonomickych subjektu — cesky registr firem (API pro ICO lookup) |
| **ICO** | Identifikacni cislo osoby — unikatni cislo ceske firmy |
| **Jednatel** | Statutarni organ (konatel) firmy — tabulka `jednatels` je deprecated, nahrazena `contacts` |
| **Kontakt** | Kontaktni osoba firmy v tabulce `contacts` (nahrazuje jednatels) |
| **Lead** | Firma v email outreach pipeline — ma `company_id` FK na `companies` |
| **Company** | Firma v master CRM — zakladni entita bez vazby na konkretni outreach kanal |
| **Vlna (Wave)** | Davka emailu k odeslani — sdruzuje leady s nastavenou sablonou a from_email |
| **Template Set** | Sada emailovych sablon s definovanou sekvenci (1., 2., 3. email...) |
| **QEV** | Quick Email Verification — externi API pro overeni platnosti emailovych adres |
| **Seznam verify** | Overeni emailu pres Seznam.cz (cesky email provider) |
| **NDR** | Non-Delivery Report — automaticka zprava o nedoruceni emailu (bounce) |
| **Enrichment** | Proces obohacovani dat o firme (ARES lookup, scraping jednatelu, generovani emailu, verifikace) |
| **Enrichment level** | Uroven obohaceni pri importu: `import_only`, `find_emails`, `full_pipeline` |
| **Vokativ** | 5. pad v cestine — pouziva se pro oslovovani (Novak → Novaku) |
| **Salutation** | Formalni oslovovani ve vokativu vcetne genderoveho prefixu (Vazeny pane / Vazena pani) |
| **RLS** | Row Level Security — bezpecnostni pravidla na urovni radku v PostgreSQL |
| **Threading** | Emailove hlavicky (Message-ID, In-Reply-To, References) pro spravne razeni do konverzaci |
| **IMAP proxy** | Mikrosluzba obchazejici n8n bug s oznacovanim emailu jako prectenych |
| **SMTP proxy** | Mikrosluzba umoznujici spravne threading hlavicky, ktere n8n emailSend nepodporuje |
| **Retarget** | Opetovne osloveni leadu, kteri neodpovedeli — s nastavitelnym `retarget_lockout_days` per tym |
| **scheduling_report** | JSON report z WF7 o planovanem odeslani vlny vcetne preskacenych leadu |
| **Bulk mode** | Hromadny rezim v Email Finderu pro zpracovani vice firem najednou |
| **StatusBadge** | UI komponenta zobrazujici stav s barvou a ikonou |

---

> Posledni aktualizace: 2026-03-12
