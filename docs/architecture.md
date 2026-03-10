# Architektura systemu

> Tento dokument popisuje technickou architekturu automatizovaneho B2B e-mail outreach systemu.
> **Cast 1** obsahuje rychly prehled pro orientaci. **Cast 2** je detailni reference.

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

Czech B2B Email Outreach je automatizovany system pro osloveni ceskych firem studenymi e-maily. System:

1. **Prijme firmu** (podle ICO nebo rucne)
2. **Obohati data** — dohledani v ARES, scrapovani jednatelu z kurzy.cz
3. **Vygeneruje a overi e-maily** — vzory adres, SMTP verifikace, QEV kontrola
4. **Odesle e-mailove sekvence** — az 3 e-maily s casovym odstupem
5. **Detekuje odpovedi** — automaticke parovani prichozich odpovedi

## Ctyri hlavni komponenty

| # | Komponenta | Co dela | Kde bezi |
|---|-----------|---------|----------|
| 1 | **n8n** | Workflow engine — ridici logika celeho pipeline | VPS (Docker) |
| 2 | **Supabase** | Databaze (PostgreSQL) + autentizace uzivatelu | Cloud (supabase.co) |
| 3 | **React UI** | Webove rozhrani pro operatory | VPS (Docker, Nginx) |
| 4 | **IMAP/SMTP proxy** | Mikrosluzby pro e-mailovou komunikaci | VPS (Docker, localhost) |

---

# Cast 2 — Detailni reference

## Diagram architektury

```
                        +------------------+
                        |   Operator (UI)  |
                        +--------+---------+
                                 |
                         HTTPS (Vite SPA)
                                 |
                        +--------v---------+
                        |   React UI       |
                        |   (outreach-ui)  |
                        +--------+---------+
                                 |
                    +------------+------------+
                    |                         |
           +-------v--------+       +--------v--------+
           |   Supabase     |       |   n8n           |
           |   (DB + Auth)  |       |   (Workflow)    |
           +-------+--------+       +--------+--------+
                   |                          |
                   |            +-------------+-------------+
                   |            |             |             |
              PostgreSQL  +----v----+  +-----v-----+ +----v----+
                          |  SMTP   |  |   IMAP    | | HTTP    |
                          |  Proxy  |  |   Proxy   | | Pozadav.|
                          |  :3002  |  |   :3001   | | (ARES,  |
                          +----+----+  +-----+-----+ | kurzy)  |
                               |             |        +---------+
                          SMTP servery  IMAP servery
                          (odchozi)     (prichozi)
```

**Legenda:**
- **Operator** — uzivatel systemu, ktery spravuje leady a vlny
- **React UI** — webova aplikace (SPA) pristupna pres prohlizec
- **Supabase** — cloudova databaze s autentizaci
- **n8n** — workflow engine, ktery ridi veskerou automatizaci
- **SMTP/IMAP Proxy** — mikrosluzby pro odesilani a prijem e-mailu

---

## Komponenty

### 1. n8n (Workflow Engine)

Self-hosted na Hostinger VPS pres Docker. Pristupny na URL nastavene v `N8N_BASE_URL`.

**Klicove vlastnosti:**
- Vsechny workflow jsou ulozeny jako JSON v `n8n-workflows/`
- Workflow se nahraji pres helper skripty (`push-*.mjs`, `import.mjs`)
- Webhook endpointy pouzivaji bearer token autentizaci (`N8N_MCP_BEARER`)
- UI vola n8n webhooky pro spousteni operaci (ingest leadu, planovani vln)

> TIP: Seznam vsech workflow s jejich ID najdete v sekci [Reference workflow](#reference-workflow).

### 2. Supabase (Databaze + Auth)

Hostovana Supabase instance poskytuje:

| Sluzba | Popis |
|--------|-------|
| **PostgreSQL** | 20 tabulek — leady, kontakty, e-maily, vlny, sablony, konfigurace |
| **Auth** | Autentizace uzivatelu (e-mail + heslo), role (admin / bezny uzivatel) |
| **RLS** | Row-level security politiky na tabulkach |
| **Realtime** | Subscriptions pro live aktualizace v UI |

UI se pripojuje pres `@supabase/supabase-js` — anon klic (frontend) a service role klic (backend skripty).

### 3. React UI (outreach-ui/)

Jednostrankova webova aplikace (SPA).

**Technologicky stack:**

| Technologie | Ucel |
|------------|------|
| React 19 + TypeScript + Vite | Zaklad aplikace |
| React Router 7 | Klientsky routing |
| TanStack React Query | Data fetching a cachovani |
| Supabase JS | Auth a pristup k databazi |
| Radix UI + TailwindCSS | Styling a komponenty |
| Tiptap | Rich text editor pro sablony |
| Recharts | Grafy na dashboardu |
| DND Kit | Drag-and-drop razeni sablon |

#### Stranky aplikace

| Cesta | Stranka | Pristup | Ucel |
|-------|---------|---------|------|
| `/login` | Prihlaseni | Verejne | Prihlaseni do systemu |
| `/prehled` | Dashboard | Prihlaseny | Prehled statistik a grafu |
| `/databaze` | Databaze | Prihlaseny | Hlavni databaze leadu |
| `/leady` | Leady | Prihlaseny | Sprava a obohacovani leadu |
| `/leady/:id` | Detail leadu | Prihlaseny | Detail jednoho leadu |
| `/vlny` | Vlny | Prihlaseny | Sprava e-mailovych kampani |
| `/vlny/:id` | Detail vlny | Prihlaseny | Detail jedne vlny |
| `/email-finder` | Email Finder | Prihlaseny | Nastroj pro vyhledavani e-mailu (4 rezimy: Podle ICO, Podle jmena, Overit e-mail, Prima sonda) |
| `/retarget` | Retarget Pool | Prihlaseny | Sprava leadu k opetovnemu osloveni |
| `/nastaveni` | Nastaveni | Pouze admin | Rozcestnik nastaveni |
| `/nastaveni/tymy` | Tymy | Pouze admin | Sprava tymu |
| `/nastaveni/obchodnici` | Obchodnici | Pouze admin | Sprava obchodniku |
| `/nastaveni/uzivatele` | Uzivatele | Pouze admin | Sprava uzivatelu |
| `/nastaveni/ucty` | Outreach ucty | Pouze admin | Konfigurace odesilacich uctu |
| `/nastaveni/api-klice` | API klice | Pouze admin | Sprava API klicu |
| `/nastaveni/sablony` | Sablony | Pouze admin | Editor e-mailovych sablon |

**Navigace v sidebar:**
- Polozky jsou rozdelene do dvou skupin odelenych vizualni carou:
  - **Datova sekce:** Prehled, Databaze, Leady
  - **Akcni sekce:** Vlny, Email Finder, Retarget
- Stranky Databaze, Leady, Vlny a Email Finder maji podzalozky v postrannim SubPanelu (desktop) nebo v rozbalovaciim menu (mobil)

> Pouze pro roli Admin: Vsechny stranky v sekci `/nastaveni` vyzaduji roli administratora.

#### React hooky

| Hook | Ucel |
|------|------|
| `useAuth` | Autentizace, profil, kontrola role |
| `useDashboard` | Statistiky, grafy, obnova dat |
| `useForceSend` | Rucni odeslani vlny |
| `useLeads` | CRUD operace s leady, filtry, strankování |
| `useMasterLeads` | Pohled na hlavni databazi leadu |
| `useWaves` | CRUD operace s vlnami, stav, sekvence |
| `useRealtime` | Supabase realtime subscriptions |
| `useRetargetPool` | Logika retarget poolu |
| `useSettings` | Konfigurace, credentials, sablony |
| `useTags` | System stitkovani leadu |
| `useUsers` | Sprava uzivatelu |
| `useMobile` | Detekce responzivniho breakpointu |
| `useMobileNav` | Stav mobilni navigace |

### 4. IMAP Proxy (imap-proxy/)

Docker mikrosluzba na portu 3001 (pouze localhost).

**Proc existuje:** n8n uzel `emailReadImap` oznacuje e-maily jako prectene (`\Seen`) a unika IMAP spojeni. Proxy pouziva `BODY.PEEK[]` — cte bez oznaceni.

| Metoda | Cesta | Pozadavek | Odpoved |
|--------|-------|-----------|---------|
| GET | `/health` | — | `{ status: "ok" }` |
| POST | `/check-inbox` | `{ credential_name: "..." }` | `{ success, emails: [...] }` |

**Konfigurace:** `config.json` (gitignored), sablona v `config.example.json`. Kazdy credential je klicem podle nazvu slotu (napr. `"Salesman IMAP 1"`).

**Zabezpeceni a spolehlivost:**
- `PROXY_AUTH_TOKEN` — povinny Bearer token pro autentizaci pozadavku (nastaveny v `docker-compose.yml`)
- Rate limiting (60 req/min per IP)
- Graceful shutdown — SIGTERM/SIGINT handler umozni dokoncit rozpracovane pozadavky (10s timeout)
- Docker healthcheck na `/health` (interval 30s, 3 retries)

### 5. SMTP Proxy (smtp-proxy/)

Docker mikrosluzba na portu 3002 (pouze localhost).

**Proc existuje:** n8n uzel `emailSend` v2.1 nepodporuje vlastni hlavicky pro e-mailovy threading (Message-ID, In-Reply-To, References). Proxy pouziva `nodemailer` s podporou threadingu.

| Metoda | Cesta | Pozadavek | Odpoved |
|--------|-------|-----------|---------|
| GET | `/health` | — | `{ status: "ok" }` |
| POST | `/send-email` | `{ credential_name, from, to, subject, html, replyTo?, messageId?, inReplyTo?, references? }` | `{ success, messageId, response }` |

**Konfigurace:** `config.json` (gitignored), sablona v `config.example.json`. Transporter caching (30min TTL).

**Zabezpeceni a spolehlivost:**
- `PROXY_AUTH_TOKEN` — povinny Bearer token pro autentizaci pozadavku (nastaveny v `docker-compose.yml`)
- Rate limiting (120 req/min per IP)
- Validace e-mailoveho formatu a ochrana proti header injection (CRLF v subjectu)
- Graceful shutdown — SIGTERM/SIGINT handler zavre vsechny SMTP transportery a docka na ukonceni spojeni (10s timeout)
- Docker healthcheck na `/health` (interval 30s, 3 retries)

---

## Datove toky

### Pipeline obohaceni leadu

```
ICO / Rucni zadani
       |
       v
[WF1: Ingest leadu] --> tabulka leads (status: new)
       |
       v
[WF2: ARES Lookup] --> enrichment_log, jednatels
       |               (firemni data, jednatele)
       v
[WF3: Kurzy Scrape] --> jednatels
       |                (doplneni dat o jednatelich)
       v
[WF4: Generovani e-mailu] --> email_candidates
       |                      (vzory e-mailovych adres)
       v
[WF5: Seznam verifikace] --> email_candidates (SMTP VRFY kontrola)
       |
       v
[WF6: QEV verifikace] --> email_candidates (kontrola dorucitelnosti)
       |
       v
Lead status: ready (ma overeny e-mail)
```

### Pipeline odesilani e-mailu

```
Operator vytvori vlnu v UI
       |
       v
[WF7: Planovani vlny] --> email_queue
       |                   (naplni frontu e-mailu podle sekvence)
       v
[WF8: Odesilaci cron] --> smtp-proxy --> SMTP server
  (kazdych 5 min)        sent_emails
       |                 (atomicky claim + kontrola denniho limitu)
       v
[WF9: Detekce odpovedi] --> imap-proxy --> IMAP server
  (kazdou 1 min)             lead_replies
       |
       v
[WF10: Denni reset] --> vynulovani pocitadel v pulnoci
  (pulnocni cron)       cisteni starych bounce zaznamu
```

### Doplnkove workflow

| Workflow | Ucel |
|----------|------|
| WF11 (Website Fallback) | Scrapuje firemni web, kdyz jine obohaceni selze |
| WF12 (ICO Scrape) | Davkovy lookup ICO z externich zdroju |
| WF13 (GSheet Proxy) | Import leadu z Google Sheets |
| wf-email-finder / v2 | Samostatny nastroj pro hledani e-mailu |
| wf-ndr-monitor / spam | Detekce bouncu/NDR z INBOX a spam slozky |
| wf-force-send | Rucni spusteni odeslani (pro testovani) |
| wf-admin-users | Webhook pro spravu uzivatelu |
| backfill-salutations | Hromadna regenerace osloveni |

---

## Reference workflow

| Soubor | n8n ID | Spoustec | Ucel |
|--------|--------|----------|------|
| wf1-lead-ingest.json | beB84wDnEG2soY1m | webhook:lead-ingest | Prijem novych leadu do systemu |
| wf2-ares-lookup.json | 2i6zvyAy3j7BjaZE | webhook:wf2-ares | Dohledani firemnich dat v ARES |
| wf3-kurzy-scrape.json | nPbr15LJxGaZUqo7 | webhook:wf3-kurzy | Scrapovani jednatelu z kurzy.cz |
| wf4-email-gen.json | RNuSFAtwoEAkb9rA | webhook:wf4-email-gen | Generovani vzoru e-mailovych adres |
| wf5-seznam-verify.json | 7JzGHAG24ra3977B | webhook:wf5-seznam | Overeni e-mailu pres SMTP VRFY |
| wf6-qev-verify.json | EbKgRSRr2Poe34vH | webhook:wf6-qev | Overeni dorucitelnosti pres QEV |
| wf7-wave-schedule.json | TVNOzjSnaWrmTlqw | webhook:wf7-wave-schedule | Naplanovani vlny do fronty |
| wf8-send-cron.json | wJLD5sFxddNNxR7p | cron:kazdych-5min | Odeslani e-mailu z fronty |
| wf9-reply-detection.json | AaHXknYh9egPDxcG | cron:kazdou-1min | Detekce odpovedi pres IMAP |
| wf10-daily-reset.json | 50Odnt5vzIMfSBZE | cron:pulnoc | Denni reset limitu a cisteni bouncu |
| wf11-website-fallback.json | E5QzxzZe4JbSv5lU | webhook:wf11-website-fallback | Fallback obohaceni z firemniho webu |
| wf12-ico-scrape.json | LGEe4MTELj5lmOFX | webhook:wf12-ico-scrape | Davkove scrapovani ICO |
| wf13-gsheet-proxy.json | ENcE8iMWLNwIPc5a | webhook:gsheet-proxy | Import leadu z Google Sheets |
| email-verification-subwf.json | Aov5PfwmBDv51L0e | executeWorkflowTrigger | Sub-workflow overeni e-mailu |
| wf-verify-wave.json | ttKdYcbucijqiaSp | — | Overeni vsech e-mailu ve vlne |
| wf-email-finder.json | N3cuyKRHS4wEyOwq | webhook:wf-email-finder | Nastroj pro hledani e-mailu (v1) |
| wf-email-finder-v2.json | 6sc6c0ZSuglJ548A | webhook:wf-email-finder-v2 | Nastroj pro hledani e-mailu (v2) |
| wf-ndr-monitor.json | xMPbk9HwSRGjBbdq | IMAP-trigger:INBOX | Monitorovani INBOX pro bounce/NDR |
| wf-ndr-monitor-spam.json | RxeW59ubWwOsDRqx | IMAP-trigger:spam | Monitorovani spam slozky pro bounce/NDR |
| sub-smtp-check.json | L6D2HcFYoNorgiom | executeWorkflowTrigger | Sub-workflow SMTP kontroly |
| sub-burner-probe.json | 9J5svDvgXBkZtOLX | webhook:sub-burner-probe | Burner e-mail probe |
| sub-reply-check.json | WjbYMqMXDxkjIssL | executeWorkflowTrigger | Sub-workflow kontroly odpovedi |
| wf-backfill-salutations.json | xbJfPwwNRIBtFtAX | webhook:backfill-salutations | Hromadna regenerace osloveni |
| wf-force-send.json | DPmnV2dRsbBMLAmz | webhook:wf-force-send | Rucni odeslani e-mailu |
| wf-admin-users.json | JeP8whw3jNtL6VJ1 | webhook:admin-users | Webhook pro spravu uzivatelu |

---

## Databazove schema

### Prehled tabulek

| Tabulka | Ucel | Klicove sloupce |
|---------|------|-----------------|
| `teams` | Metadata organizace/tymu | id, name, salesman_email |
| `outreach_accounts` | Odsilaci e-mailove ucty (1 na tym, UNIQUE) | id, team_id, credential_name |
| `leads` | Firemni leady | id, team_id, ico, company_name, status, master_status |
| `enrichment_log` | Historie kroku obohaceni | id, lead_id, step, status, data |
| `jednatels` | Jednatele/kontakty firem | id, lead_id, full_name, first_name, last_name, salutation |
| `email_candidates` | Vygenerovane/overene e-mailove adresy | id, jednatel_id, email, verified, source |
| `template_sets` | Skupiny e-mailovych sablon | id, team_id, name |
| `email_templates` | Jednotlive sablony s A/B variantami | id, set_id, sequence, variant, subject, body |
| `waves` | E-mailove kampane (vlny) | id, team_id, template_set_id, status, scheduled_at |
| `wave_leads` | Leady prirazene do vln | id, wave_id, lead_id, status |
| `email_queue` | Fronta e-mailu k odeslani | id, wave_lead_id, sequence, status, scheduled_at |
| `sent_emails` | Zaznamy o odeslanych e-mailech | id, queue_id, message_id, to, subject, sent_at |
| `lead_replies` | Zaznamy o prijatych odpovedich | id, sent_email_id, lead_id, body, received_at |
| `config` | Runtime konfigurace (klic/hodnota) | key, value |
| `salesmen` | Obchodnici tymu | id, team_id, name, email |
| `email_verifications` | Cache overovacu e-mailu | id, email, provider, result |
| `email_probe_bounces` | Zaznamy o detekci bouncu | id, email, bounce_type, detected_at |
| `profiles` | Uzivatelske profily (navazane na Supabase auth) | id, email, role, display_name |
| `processed_reply_emails` | Deduplikace odpovedi | id, message_id, processed_at |
| `unmatched_replies` | Odpovedi, ktere nebyly sparovany s odeslanyim e-mailem | id, raw_from, raw_subject, received_at |

### Klicove vztahy mezi tabulkami

- `leads` patri do `teams` (pres team_id)
- `outreach_accounts` patri do `teams` (UNIQUE constraint: 1 na tym)
- `jednatels` patri k `leads` (pres lead_id)
- `email_candidates` patri k `jednatels` (pres jednatel_id)
- `waves` patri do `teams` a odkazuje na `template_sets`
- `wave_leads` propojuje `waves` a `leads`
- `email_queue` odkazuje na `wave_leads`
- `sent_emails` odkazuje na `email_queue`
- `lead_replies` odkazuje na `sent_emails` a `leads`
- `salesmen` patri do `teams`

### Databazove funkce

| Funkce | Ucel |
|--------|------|
| `ingest_lead()` | Zpracovani a vlozeni noveho leadu |
| `reset_daily_sends()` | Vynulovani dennich pocitadel odeslani (volano v pulnoci) |
| `claim_queued_emails()` | Atomicky claim davky e-mailu z fronty |
| `increment_and_check_sends()` | Atomicka kontrola a inkrementace denniho limitu |
| `get_dashboard_stats()` | Agregovane metriky pro dashboard |
| `get_jednatels_for_lead()` | Ziskani vsech kontaktu pro dany lead |
| `check_email_cache()` | Vyhledani v cache overeni e-mailu |
| `mark_jednatels_email_status()` | Aktualizace stavu overeni e-mailu na kontaktech |
| `check_max_salesmen()` | Kontrola limitu poctu obchodniku |
| `parse_full_name()` | Rozdeleni full_name na first_name a last_name |
| `generate_salutation()` | Generovani ceskeho osloveni ve vokativu |
| `backfill_salutations()` | Hromadna regenerace osloveni pro vsechny kontakty |
| `check_and_mark_reply_processed()` | Deduplikace zpracovani odpovedi |
| `check_lead_duplicates(candidates)` | Kontrola duplicit leadu pred importem (ICO, domena, e-mail, nazev firmy) — globalne pres vsechny tymy |
| `auto_complete_waves()` | Oznaceni vlny jako dokoncene, kdyz jsou vsechny e-maily odeslany |
| `reorder_template_sequences()` | Prerazeni poradovych cisel sablon |
| `handle_lead_reply()` | Trigger funkce pro zpracovani odpovedi |

### Databazove triggery

| Trigger | Tabulka | Udalost | Chovani |
|---------|---------|---------|---------|
| `trg_auto_salutation` | `jednatels` | INSERT/UPDATE | Rozlozi `full_name` na krestni/prijmeni, vygeneruje ceske osloveni ve vokativu s predponou "Vazeny pane" / "Vazena pani" |
| `trg_refresh_salutations_on_wave_add` | `wave_leads` | AFTER INSERT | Aktualizuje `jednatels.updated_at` pro obnovu osloveni u leadu pridanych do vlny |

### Pravidla ceskeho vokativu

System generuje formalni ceska osloveni ve vokativu. Pravidla (v poradi priority):

| Pravidlo | Priklad |
|----------|---------|
| Adjektivni prijmeni (typu -y/-i) | beze zmeny |
| Koncovka `-ek` | `-ku` (Novacek → Novacku) |
| Koncovka `-ec` | `-ce` (Nemec → Nemce) |
| Koncovka `-el` | `-le` (Havel → Havle) |
| Koncovka `-a` | `-o` (Kafka → Kafko) |
| Digrafy (th/ph/gh) | pridej `-e` |
| Koncovka `-k/-h/-g` | pridej `-u` (Novak → Novaku) |
| Mekke souhlasky | pridej `-i` |
| Ostatni souhlasky (vcetne w/x/q) | pridej `-e` |

---

## Model zabezpeceni

| Oblast | Mechanismus |
|--------|-------------|
| Webhook autentizace | Bearer token (`N8N_MCP_BEARER`) na vsech n8n webhookach |
| UI autentizace | Supabase Auth (e-mail + heslo), kontrola admin role na chranenych strankach |
| Radkove zabezpeceni | Row-level security (RLS) politiky na Supabase tabulkach |
| Proxy pristupy | IMAP a SMTP proxy nasloucha pouze na localhost (127.0.0.1) — nedostupne z venku |
| Proxy autentizace | Bearer token (`PROXY_AUTH_TOKEN`) povinny pro vsechny proxy endpointy (krome /health) |
| Sprava tajemstvi | Zadne hardcoded secrets — vse v `.env.local` nebo v Supabase tabulce `config` |
| E-mailova atribuce | Zadny outgoing e-mail nesmi obsahovat n8n branding |
| Validace prostredi | UI validuje `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_N8N_WEBHOOK_URL` pri startu |
| CI/CD | GitHub Actions: lint → typecheck → test → build na kazdem push/PR do main |

> POZOR: Kazdy novy workflow, ktery odesila e-maily, musi mit `options.appendAttribution: false`. Systemove pravidlo — zadna n8n atribuce v odchozich zpravach.

---

## Slovnicek

| Pojem | Vysvetleni |
|-------|-----------|
| **Lead** | Firemnickontakt urceny k osloveni (identifikovany ICO nebo nazvem firmy) |
| **Jednatel** | Statutarni organ (reditel, jednatel) firmy — osoba, ktere se odesila e-mail |
| **Vlna (Wave)** | E-mailova kampan — skupina leadu, kteri dostanou sekvenci e-mailu |
| **Sekvence** | Rada az 3 e-mailu odeslanychpostupne s casovym odstupem (seq1 → seq2 → seq3) |
| **Template set** | Sada e-mailovych sablon pro vlnu (3 sekvence x 2 A/B varianty) |
| **Obohaceni (Enrichment)** | Proces doplneni dat o firme — ARES lookup, scrapovani jednatelu, generovani e-mailu |
| **ICO** | Identifikacni cislo osoby — unikatni identifikator ceske firmy |
| **ARES** | Administrativni registr ekonomickych subjektu — statni registr ceskych firem |
| **QEV** | QuickEmailVerification — externi API pro overeni dorucitelnosti e-mailu |
| **NDR** | Non-Delivery Report — zprava o nedoruceni e-mailu (bounce) |
| **Vokativ** | Paty pad cestiny — pouziva se pro osloveni (napr. "Novak" → "Novaku") |
| **RLS** | Row-Level Security — zabezpeceni na urovni radku v PostgreSQL |
| **Claim** | Atomicke prevzeti e-mailu z fronty k odeslani (zamezi duplicitam) |
| **Threading** | Provazani e-mailu v konverzaci pomoci hlavicek Message-ID, In-Reply-To, References |
| **Cron** | Casove planovany spoustec — workflow bezi automaticky v nastavenych intervalech |
| **Webhook** | HTTP endpoint, ktery spusti workflow po prijeti pozadavku |
| **SPA** | Single Page Application — webova aplikace nacitana jako jedina stranka |
| **CI/CD** | Continuous Integration / Continuous Deployment — automaticke testovani a nasazeni kodu |
| **Vitest** | Testovaci framework pro Vite projekty — pouziva se pro unit a komponentove testy |
| **Healthcheck** | Kontrolni endpoint pro overeni, ze sluzba bezi a odpovida spravne |
| **Graceful shutdown** | Kontrolovane ukonceni serveru — dockani na dokonceni rozpracovanych pozadavku pred vypnutim |

---

## Testovaci infrastruktura

### UI testy (outreach-ui/)

**Framework:** Vitest + React Testing Library + jsdom

| Typ testu | Soubory | Co testuje |
|-----------|---------|-----------|
| Unit testy | `lib/n8n.test.ts`, `lib/export.test.ts` | Webhook URL builder, headers, CSV export |
| Hook testy | `hooks/useMobile.test.ts` | Mobilni breakpoint detekce |
| Komponentove testy | `components/glass/*.test.tsx`, `AuthProvider.test.tsx` | GlassButton, GlassInput, GlassModal, autentizace |
| Strankove testy | `pages/DashboardPage.test.tsx` | Dashboard loading/error/data stavy |

**Spusteni:**

```bash
cd outreach-ui
npm test          # jednorazovy beh
npm run test:watch # sledovani zmen
```

### Proxy testy

| Soubor | Co testuje |
|--------|-----------|
| `imap-proxy/server.test.mjs` | Health endpoint, auth validace, rate limiting, neplatne pozadavky |
| `smtp-proxy/server.test.mjs` | Health endpoint, auth validace, header injection ochrana, rate limiting |

### CI/CD pipeline

Soubor: `.github/workflows/ci.yml`

Pipeline bezi automaticky na push a PR do `main`:

1. **Lint** — ESLint kontrola
2. **Typecheck** — TypeScript kompilace
3. **Test** — Vitest unit/komponentove testy
4. **Build** — Produkční build

---

*Posledni aktualizace: brezen 2026*
