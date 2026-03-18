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

Cely pipeline je rizen 28+ n8n workflow, data jsou v Supabase (PostgreSQL) a uzivatelske rozhrani je React SPA.

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
- `config` tabulka pro runtime secrets (seznam_from_email). QEV klice deprecated.

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
| `/email-finder` | EmailFinderPage | Admin | Hledani emailu — dve zakladky: "Najit emaily" (firemni hledani pres v3) a "Overit email" (overeni jednotliveho emailu pres v2) |
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
| `useWavePresets` | `useWavePresets.ts` | Sprava wave presets (sablony konfigurace vln) |
| `useWaves` | `useWaves.ts` | CRUD operace nad vlnami |
| `useImportGroups` | `useImportGroups.ts` | Sprava importnich skupin |

#### Demo Mode (prezentacni rezim)

System obsahuje vestaveny demo rezim pro prezentace a skoleni. Kdyz je aktivni, UI zobrazuje fiktivni ceska B2B data misto realnych dat ze Supabase.

**Architektura:**
- **DemoModeContext** (`src/contexts/DemoModeContext.tsx`) — React context poskytujici `isDemoMode` a `toggleDemoMode`. Obaluje celou aplikaci (uvnitr `AuthProvider`, kolem `Routes`).
- **demo-data.ts** (`src/lib/demo-data.ts`) — obsahuje vsechny fiktivni entity: 15 firem, kontakty, leady, 4 vlny, 2 sady sablon, dashboard statistiky atd.
- **Stav** se uklada do `localStorage('demo-mode')` a preziva reload stranky.

**Chovani v demo rezimu:**
- Vsechny datove hooky (`useDashboard`, `useCompanies`, `useLeads`, `useWaves`, `useContacts`, `useTags`, `useRetargetPool`, `useSettings`, `useWavePresets`, `useForceSend`, `useImportGroups`, `useMasterLeads`, `useSystemLogs`, `useWorkflowStats`) vraci fiktivni data misto Supabase/n8n volani (queryFn early-return pattern).
- Vsechny mutace (vytvareni, editace, mazani) tichy no-op — tlacitka nic nedelaji.
- `useRealtime` preskakuje Supabase realtime subscriptions.
- `OnboardingChecklist` vraci vsechny polozky jako dokoncene.
- System health, system logs a workflow stats stranky take zobrazuji fiktivni data.

**Vizualni indikace:**
- Prepinaci tlacitko (ikona Eye) v TopBar mezi bug reportem a user avatarem.
- Aktivni stav: ikona se zbarvi zlute (#f59e0b).

#### Dalsi UI vlastnosti

- **CSV import** podporuje urovne enrichmentu: `import_only` (pouze import), `find_emails` (najdi emaily), `full_pipeline` (kompletni obohaceni)
- **AddLead dialog** podporuje volbu enrichmentu
- **Email Finder** ma dve zakladky: "Najit emaily" (company-centric hledani pres wf-email-finder-v3) a "Overit email" (overeni jednotliveho emailu pres wf-email-finder-v2). Stare zakladky ICO/Name/Probe/Bulk byly odstraneny. Nova utility funkce `cleanDomainInput()` v `outreach-ui/src/lib/dedup.ts` cisti domenove vstupy
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
   - Vola BE i VR endpoint (merge kontaktu do contacts tabulky)
   - **ARES BE Lookup** — extrahuje website (www) z ARES BE odpovedi
   - Pokud ARES najde domenu a lead zadnou nema → zapise do leads + companies
   - Pokud neni ICO ale lead ma domenu → preskoci WF3, spusti WF4 primo
   - **Pokud neni ICO a neni domena → posle do WF4** (misto fail, WF4 ma domain discovery)
        |
        v (s ICO)              v (bez ICO)
   WF3: Kurzy Scrape           WF4: Email Gen (primo/fallback)
   (webhook:wf3-kurzy)
   - Scraping kontaktnich osob z kurzy.cz
   - **Extrahuje website z Kurzy HTML** pokud lead nema domenu
   - Zapisuje domain do leads + companies
   - Uklada do contacts tabulky (pres company_id)
        |
        v
   WF4: Email Gen (webhook:wf4-email-gen)
   - Kontroluje, zda lead ma domenu
   - **Pokud ne → spusti sub-domain-discovery** (ARES BE → DNS probe → DuckDuckGo)
   - Po nalezeni domeny zapise do leads + companies, pokracuje s generovanim
   - Nacita kontakty pres get_contacts_for_lead() RPC
   - Generuje emailove adresy z jmena + domeny
   - Uklada do email_candidates
        |
        v
   WF5: SMTP Verification (webhook:wf5-seznam)
   - Nacita kontakty pres get_contacts_for_lead() RPC (pres leads.company_id)
   - SMTP overeni pres Seznam (zda email existuje)
   - Nastavuje seznam_status='verified' (drive 'likely_valid'), is_verified=true, is_catch_all na email_candidates
   - Oznacuje vysledky pres mark_jednatels_email_status() RPC
   - Vzdy spousti WF11 (nenastavuje finalni lead status)
        |
        v
   WF11: Website Email Scraper (webhook:wf11-website-fallback)
   - Scrapuje firemni web pro dalsi emaily
   - Generuje kombinace emailu pro kontakty
   - SMTP overeni nalezenych kandidatu
   - Nastavuje FINALNI lead status na zaklade VSECH email_candidates:
     ready (jednatel verified) > staff_email > info_email > failed
        |
        v
   Lead je pripraven k odesilani (status: ready/staff_email/info_email/failed)
```

**Pozn:** WF6 (QEV Verify) je **deaktivovany** — SMTP overeni v WF5 poskytuje stejne vysledky. QEV mel bug s `safe_to_send: "true"` (string vs boolean).

**Dual-strictness pristup k SMTP overeni:**
- **WF5 (combo emaily):** Strikni — `is_valid` vyzaduje `smtp_result === 'valid'`. Combo-generovane emaily (jmeno + domena) nemaji zadnou zaruku, ze existuji, takze SMTP musi explicitne potvrdit.
- **WF11 (website-scraped emaily):** Lenientni — odmitne jen `smtp_result === 'invalid'` (server explicitne odmitl RCPT TO). Emaily nalezene na firemnim webu maji vysokou pravdepodobnost, ze jsou skutecne. SMTP chyby (`error`, `timeout`) casto znamenaji blokovany port 25 nebo rate limiting, ne neexistujici email. Catch-all je u website emailu akceptovany.

**Doplnkove enrichment workflow:**
- **WF11: Website Email Scraper** — vzdy se spousti po WF5, scrapuje firemni web pro dalsi emaily, nastavuje finalni lead status
- **WF12: ICO Scrape** — scraping ICO z webovych stranek
- **wf-email-finder / v2** — starsi verze Email Finderu (v2 pouziva se pro overeni jednotliveho emailu z UI)
- **wf-email-finder-v3** — novy firemni orchestrator pro hledani emailu (pouziva se z UI zakladky "Najit emaily"). Resolves company (domain lookup, ARES, firmy.cz fallback), fetches contacts, generates email patterns, SMTP checks, catch-all probe, website scraping pro backup emaily, upsert do email_candidates.
- **sub-clean-domain** — sub-workflow pro cisteni a validaci domenoveho vstupu (Execute Workflow trigger)
- **sub-domain-discovery** — sub-workflow pro hledani domeny firmy. Vstupy: lead_id, company_id, company_name, ico. Zkouzi 3 zdroje v poradi: ARES BE (pokud je ICO), DNS probe (.cz/.com), DuckDuckGo. Firmy.cz odstranen (migrace na SPA). Vraci `{ found, domain, source }`. Pouziva se z WF4 pro leady bez domeny a z Email Finder V3 jako fallback.

### 2. Sending pipeline

```
   WF7: Wave Schedule (webhook:wf7-wave-schedule)
   - Prirazeni leadu do vlny → email_queue
   - Tracking preskacenych leadu v scheduling_report
   - Ulozi scheduling_report + sequence_schedule do waves tabulky
   - **Drip mode:** waves.daily_lead_count (nullable int)
     - NULL = vsechny leady na den 1 (default, zpetne kompatibilni)
     - Kladne cislo = pocet novych leadu denne (napr. 50)
     - Leady se davkuji: lead_index / daily_lead_count = cislo davky (den)
     - seq2/seq3 datumy jsou relativni k seq1 daneho leadu (ne globalni)
     - Pouziva delay_seq1_to_seq2_days a delay_seq2_to_seq3_days
   - sequence_schedule JSONB obsahuje send_date + send_date_end (rozsah pro drip)
        |
        v
   WF8: Send Cron (cron:every-1min)
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
- **sub-reply-check** — sub-workflow pro kontrolu odpovedi. Obsahuje "IF Not Already Replied" node — pokud lead uz ma `status = 'replied'`, dalsi emaily z vlakna se preskoci (zadny novy `lead_reply` zaznam).

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
| wf1-lead-ingest | beB84wDnEG2soY1m | webhook:lead-ingest | Prijem a vytvoreni leadu (ingest_lead RPC), vlozeni kontaktu do contacts |
| wf2-ares-lookup | 2i6zvyAy3j7BjaZE | webhook:wf2-ares | ARES ICO lookup (BE + VR endpoint), uklada kontakty do contacts pres company_id. Bez ICO ale s domenou → preskoci WF3 a spusti WF4 primo |
| wf3-kurzy-scrape | nPbr15LJxGaZUqo7 | webhook:wf3-kurzy | Scraping kontaktnich osob z kurzy.cz do contacts tabulky |
| wf4-email-gen | RNuSFAtwoEAkb9rA | webhook:wf4-email-gen | Generovani emailovych adres (get_contacts_for_lead RPC) |
| wf5-seznam-verify | 7JzGHAG24ra3977B | webhook:wf5-seznam | SMTP overeni emailu (get_contacts_for_lead RPC), seznam_status='verified' + is_verified=true, mark_jednatels_email_status, vzdy spousti WF11 |
| wf6-qev-verify | EbKgRSRr2Poe34vH | webhook:wf6-qev | **DEAKTIVOVANY** — QEV overeni odstraneno, SMTP staci |
| wf7-wave-schedule | TVNOzjSnaWrmTlqw | webhook:wf7-wave-schedule | Planovani vlny + scheduling_report (contacts nested select). Podporuje drip mode (daily_lead_count) — davkovani leadu po dnech s relativnimi seq delay. |
| wf8-send-cron | wJLD5sFxddNNxR7p | cron:every-1min | Odesilani emailu z fronty |
| wf9-reply-detection | AaHXknYh9egPDxcG | cron:every-1min | Detekce odpovedi pres IMAP proxy |
| wf10-daily-reset | 50Odnt5vzIMfSBZE | cron:midnight | Reset dennich pocitadel + cisteni |
| wf11-website-fallback | E5QzxzZe4JbSv5lU | webhook:wf11-website-fallback | Website email scraper + finalni lead status (vzdy spousten z WF5). Fetch nody bez fullResponse:true (fix 0-items bug). Rozpoznava seznam_status 'verified' i 'likely_valid'. Lenientni SMTP klasifikace: odmitne jen smtp_result='invalid' (viz dual-strictness nize). |
| wf12-ico-scrape | LGEe4MTELj5lmOFX | webhook:wf12-ico-scrape | Scraping ICO z webovych stranek |
| wf13-gsheet-proxy | ENcE8iMWLNwIPc5a | webhook:gsheet-proxy | Google Sheets proxy |
| email-verification sub-wf | Aov5PfwmBDv51L0e | executeWorkflowTrigger | Sdileny sub-workflow pro overeni emailu |
| wf-verify-wave | ttKdYcbucijqiaSp | — | Overeni vsech emailu ve vlne |
| wf-email-finder | N3cuyKRHS4wEyOwq | webhook:wf-email-finder | Email finder v1 |
| wf-email-finder-v2 | 6sc6c0ZSuglJ548A | webhook:wf-email-finder-v2 | Email finder v2 (overeni jednotliveho emailu) |
| wf-email-finder-v3 | KRWLgqTf5ILqSNpk | webhook:wf-email-finder-v3 | Email finder v3 — firemni orchestrator (domain lookup, ARES, firmy.cz fallback, kontakty, email patterns, SMTP check, catch-all probe, website scraping, upsert do email_candidates) |
| sub-clean-domain | 9H3NH7YbR1X2Efgm | executeWorkflowTrigger | Sub-workflow: cisteni a validace domenoveho vstupu |
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
| `companies` | **Master CRM** — vsechny firmy | id, company_name, ico, website, domain, master_status, team_id, created_at, updated_at |
| `leads` | **Email outreach vrstva** — navazano na companies | id, company_id (FK → companies), status, team_id |
| `contacts` | Kontaktni osoby firem (nahrazuje jednatels) | id, company_id (FK → companies), full_name, first_name, last_name, salutation, role, phone, linkedin, other_contact, notes, created_at, updated_at |
| `jednatels` | **Deprecated** — zachovano pro zpetnou kompatibilitu, vsechny workflow jiz pouzivaji `contacts` | Stejna UUID jako contacts |
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
| `waves` | Vlny odesilani (from_email, scheduling_report, daily_lead_count, delay_seq1_to_seq2_days, delay_seq2_to_seq3_days) |
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
| `config` | Key/value konfigurace (seznam_from_email). QEV klice deprecated. |
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
| **Enrichment** | Proces obohacovani dat o firme (ARES lookup, scraping kontaktu, generovani emailu, verifikace) |
| **Enrichment level** | Uroven obohaceni pri importu: `import_only`, `find_emails`, `full_pipeline` |
| **Vokativ** | 5. pad v cestine — pouziva se pro oslovovani (Novak → Novaku) |
| **Salutation** | Formalni oslovovani ve vokativu vcetne genderoveho prefixu (Vazeny pane / Vazena pani) |
| **RLS** | Row Level Security — bezpecnostni pravidla na urovni radku v PostgreSQL |
| **Threading** | Emailove hlavicky (Message-ID, In-Reply-To, References) pro spravne razeni do konverzaci |
| **IMAP proxy** | Mikrosluzba obchazejici n8n bug s oznacovanim emailu jako prectenych |
| **SMTP proxy** | Mikrosluzba umoznujici spravne threading hlavicky, ktere n8n emailSend nepodporuje |
| **Retarget** | Opetovne osloveni leadu, kteri neodpovedeli — s nastavitelnym `retarget_lockout_days` per tym |
| **scheduling_report** | JSON report z WF7 o planovanem odeslani vlny vcetne preskacenych leadu |
| **Drip mode** | Rezim planovani vlny s `daily_lead_count` — leady se davkuji po dnech misto odeslani vsech najednou. Seq2/seq3 jsou relativni ke kazdemu leadu. |
| **sequence_schedule** | JSONB v `waves` — casovy rozvrh sekvenci vcetne `send_date` a `send_date_end` (rozsah pro drip mode) |
| **Email Finder v3** | Novy firemni orchestrator (wf-email-finder-v3) — resolves firmu, nacte kontakty, generuje emaily, SMTP check, catch-all probe, website scraping, upsert do email_candidates |
| **sub-clean-domain** | Sub-workflow pro cisteni a validaci domenoveho vstupu (odebira protokol, cestu, bile znaky) |
| **cleanDomainInput()** | Frontendova utility funkce v `outreach-ui/src/lib/dedup.ts` pro cisteni domenoveho vstupu pred odeslanim na backend |
| **StatusBadge** | UI komponenta zobrazujici stav s barvou a ikonou |
| **Demo Mode** | Prezentacni rezim UI — zobrazuje fiktivni ceska B2B data misto realnych. Prepina se tlacitkem Eye v TopBar, stav v localStorage. Admin stranky neovlivneny. |
| **DemoModeContext** | React context (`src/contexts/DemoModeContext.tsx`) poskytujici `isDemoMode` a `toggleDemoMode` celemu UI |
| **demo-data.ts** | Modul s fiktivnimi daty pro demo rezim — firmy, kontakty, leady, vlny, sablony, dashboard stats |

---

> Posledni aktualizace: 2026-03-17
