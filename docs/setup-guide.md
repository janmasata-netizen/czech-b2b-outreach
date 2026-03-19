# Pruvodce nastavenim

> Tento dokument vas provede kompletnim nastavenim systemu Czech B2B Email Outreach.
> **Cast 1** je rychly checklist pro prvni den. **Cast 2** obsahuje detailni kroky.

---

## Navigace

| Jsem... | Chci... | Prejdete na... |
|---------|---------|----------------|
| Novy vyvojar | Rychle rozbehnout projekt | [Checklist prvniho dne](#cast-1--checklist-prvniho-dne) |
| Vyvojar | Nastavit lokalni prostredi | [Klonovani a konfigurace](#1-klonovani-a-konfigurace) |
| Vyvojar | Spustit UI lokalne | [Lokalni vyvoj](#2-lokalni-vyvoj) |
| Vyvojar | Nasadit workflow do n8n | [Nasazeni workflow](#3-nasazeni-workflow-do-n8n) |
| Admin | Nasadit na VPS | [Nasazeni na VPS](#4-nasazeni-na-vps) |
| Admin | Nastavit novy Supabase projekt | [Supabase setup](#5-supabase-setup-nova-instalace) |
| Kdokoliv | Reference promennych prostredi | [Prehled promennych](#6-prehled-promennych-prostredi) |

---

# Cast 1 — Checklist prvniho dne

Postupujte v poradi. Kazdym krokem se priblizite k funkcnimu systemu.

- [ ] Naklonovat repozitar (`git clone git@github.com:janmasata-netizen/czech-b2b-outreach.git`)
- [ ] Zkopirovat `.env.example` do `.env.local` a vyplnit vsechny hodnoty
- [ ] Nainstalovat zavislosti UI (`cd outreach-ui && npm install`)
- [ ] Spustit UI lokalne (`npm run dev`) a overit prihlaseni na `http://localhost:5173`
- [ ] Spustit testy (`npm test` v `outreach-ui/`) a overit, ze prochazi
- [ ] Importovat workflow do n8n (`cd n8n-workflows && node import.mjs`)
- [ ] Organizovat workflow pomoci tagu (`node organize.mjs`)
- [ ] Overit, ze vsechny workflow jsou aktivni v n8n UI
- [ ] Nasadit IMAP proxy na VPS (`cd imap-proxy && node deploy.mjs`)
- [ ] Nasadit SMTP proxy na VPS (`cd smtp-proxy && node deploy.mjs`)
- [ ] Nasadit UI na VPS (`cd outreach-ui && npm run build && node deploy-ssh2.mjs`)
- [ ] Vytvorit admin uzivatele (`cd n8n-workflows && node create-admin.mjs`)

> **TIP:** Pokud nastavujete system od nuly (novy Supabase projekt), zacnete nejdriv sekci [5. Supabase Setup](#5-supabase-setup-nova-instalace) a pak se vratte k tomuto checklistu.

> **POZOR:** SSH klic `~/.ssh/vps_deploy_key` musi byt pripraven pred jakoukoli operaci s VPS (`72.62.53.244`).

---

# Cast 2 — Detailni kroky

## 1. Klonovani a konfigurace

### Krok 1.1 — Klonovat repozitar

**Cil:** Ziskat zdrojovy kod na lokalni pocitac.

**Predpoklady:**
- Nainstalovan Git
- SSH klic pripojen ke GitHub uctu

**Postup:**

```bash
git clone git@github.com:janmasata-netizen/czech-b2b-outreach.git
cd czech-b2b-outreach
```

**Vysledek:** Adresar `czech-b2b-outreach/` s celym projektem.

### Krok 1.2 — Nastavit promenne prostredi

**Cil:** Pripravit konfiguraci pro pripojeni ke vsem sluzbam.

**Predpoklady:**
- Pristup do Supabase Dashboard
- Pristup do n8n Settings (API key)
- IP adresa VPS: `72.62.53.244`

**Postup:**

```bash
cp .env.example .env.local
```

Otevrete `.env.local` a vyplnte vsechny hodnoty:

| Promenna | Popis | Kde ji najdete |
|----------|-------|----------------|
| `N8N_BASE_URL` | URL n8n instance (napr. `http://72.62.53.244:32770`) | VPS Docker konfigurace |
| `N8N_API_KEY` | API klic pro n8n REST API | n8n > Settings > API |
| `N8N_MCP_BEARER` | Bearer token pro webhook autentizaci | Vygenerujte nahodny token, nastavte v n8n |
| `SUPABASE_URL` | URL Supabase projektu | Supabase Dashboard > Settings > API |
| `SUPABASE_PROJECT_REF` | Referencni ID projektu | Supabase Dashboard > Settings > General |
| `SUPABASE_SERVICE_ROLE_KEY` | Servisni klic (plny pristup) | Supabase Dashboard > Settings > API |
| `SUPABASE_MANAGEMENT_TOKEN` | Token pro Management API | Supabase Dashboard > Access Tokens |
| `HOSTINGER_API_TOKEN` | API token Hostinger | Hostinger kontrolni panel |
| `VPS_IP` | IP adresa VPS | `72.62.53.244` |
| `VITE_SUPABASE_URL` | Frontend Supabase URL (stejna jako `SUPABASE_URL`) | Viz vyse |
| `VITE_SUPABASE_ANON_KEY` | Frontend anon/verejny klic | Supabase Dashboard > Settings > API |
| `VITE_N8N_WEBHOOK_URL` | Frontend n8n webhook URL | Stejna jako `N8N_BASE_URL` + `/webhook` |
| `VITE_WEBHOOK_SECRET` | Secret pro webhook autentizaci z frontendu | Stejny jako `N8N_MCP_BEARER` |

**Vysledek:** Soubor `.env.local` s kompletni konfiguraci.

> **POZOR:** Nikdy necommitujte `.env.local` do Gitu. Soubor je v `.gitignore`.

> **Caste chyby:**
> - Zapomenuti na `/webhook` suffix u `VITE_N8N_WEBHOOK_URL`
> - Zamena `SUPABASE_SERVICE_ROLE_KEY` s `VITE_SUPABASE_ANON_KEY` — kazdy se pouziva jinde
> - Pouziti stareho API klice po regeneraci v n8n

---

## 2. Lokalni vyvoj

### Krok 2.1 — Spustit UI lokalne

**Cil:** Rozbehnout vyvojovy server pro praci na frontendu.

**Predpoklady:**
- Node.js v18+
- Vyplneny `.env.local` (minimalne `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_N8N_WEBHOOK_URL`)

**Postup:**

```bash
cd outreach-ui
npm install
npm run dev
```

**Vysledek:** Vyvojovy server na `http://localhost:5173`.

> **POZOR:** UI validuje povinne promenne prostredi pri startu (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_N8N_WEBHOOK_URL`). Pokud nejsou nastaveny, zobrazi se chybova hlaska misto aplikace.

> **TIP:** UI cte promenne prostredi z `../.env.local` (nadrazeny adresar) pres Vite konfiguraci. Import alias `@` ukazuje na `./src` — napr. `@/hooks/useLeads` odpovida `src/hooks/useLeads.ts`.

> **TIP:** UI obsahuje **Demo Mode** (prezentacni rezim) — po prihlaseni kliknete na ikonu oka v TopBar a cele UI zobrazi fiktivni ceska B2B data misto realnych. Uzitecne pro prezentace, skoleni nebo offline praci bez Supabase pripojeni. Stav se uklada do localStorage. Podrobnosti viz [Provozni prirucka — Demo rezim](operations-manual.md#8-demo-rezim-prezentacni-rezim).

### Krok 2.2 — Spustit testy

**Cil:** Overit, ze codebase je v poradku.

**Postup:**

```bash
cd outreach-ui
npm test          # jednorazovy beh
npm run test:watch # sledovani zmen (vyvoj)
```

**Vysledek:** Vsechny testy prochazi. Testy pokryvaji utility, hooky, komponenty, AuthProvider a DashboardPage.

### Krok 2.3 — Prace s workflow

**Cil:** Upravit a nasadit workflow soubory.

Workflow JSON soubory jsou v `n8n-workflows/`. Postup uprav:

1. Upravte JSON soubor lokalne
2. Nahrajte do n8n pomoci push skriptu (viz sekce 3)
3. Overte v n8n UI, ze je workflow aktivni a spravny

> **TIP:** Vsechny helper skripty ctou secrets z `env.mjs` (ktery nacita `../.env.local`). Zadne hardcoded secrets ve skriptech.

### Krok 2.4 — Dalsi prikazy pro vyvoj

| Prikaz | Popis |
|--------|-------|
| `npm run dev` | Vite vyvojovy server s hot reload |
| `npm run build` | TypeScript kompilace + Vite build do `dist/` |
| `npm run lint` | ESLint kontrola kodu |
| `npm run preview` | Nahled produkciho buildu lokalne |
| `npm test` | Jednorazovy beh testu (Vitest) |
| `npm run test:watch` | Sledovani zmen a prubezne testy |

---

## 3. Nasazeni workflow do n8n

### Krok 3.1 — Import vsech workflow (nova instance)

**Cil:** Importovat vsechny workflow do ciste n8n instance.

**Predpoklady:**
- Vyplnene `N8N_BASE_URL` a `N8N_API_KEY` v `.env.local`
- Pristup k n8n API

**Postup:**

```bash
cd n8n-workflows
node import.mjs
```

Skript provede:
1. Nacte vsechny `wf-*.json` a `sub-*.json` soubory
2. Odstrani `pinData` a nastavi `active: false`
3. Odesle POST do n8n API pro vytvoreni novych workflow

**Vysledek:** Vsechny workflow nahrane do n8n, bez testovacich dat.

> **POZOR:** `import.mjs` spoustejte pouze pri prvni instalaci. Pro aktualizace pouzijte `update.mjs` nebo konkretni `push-*.mjs` skript.

### Krok 3.2 — Aktualizace nejcasteji menenych workflow

**Cil:** Rychla aktualizace WF7, WF8 a WF10.

**Postup:**

```bash
cd n8n-workflows
node update.mjs
```

Skript deaktivuje kazdy workflow, provede PUT aktualizaci a znovu aktivuje.

### Krok 3.3 — Push jednotlivych workflow

**Cil:** Nahrat konkretni workflow do n8n.

**Postup:**

```bash
cd n8n-workflows

# Priklad — push jednoho workflow:
node push-v2.mjs                # Push sady workflow (v2)
node push-wf8-threading-fix.mjs # WF8 threading fix
node push-wf7-report.mjs        # WF7 scheduling report
node push-wf10.mjs              # WF10 daily reset
```

**Kompletni seznam push skriptu:**

| Skript | Popis |
|--------|-------|
| `push-v2.mjs` | Push sady workflow (verze 2) |
| `push-wf8-threading-fix.mjs` | Nasazeni WF8 threading fix |
| `push-wf7-report.mjs` | Nasazeni WF7 scheduling report |
| `push-wf10.mjs` | WF10 daily reset |
| `push-admin-users.mjs` | Admin users workflow |
| `push-audit-fixes.mjs` | Audit fixy |
| `push-auto-complete.mjs` | Auto-complete waves |
| `push-from-email.mjs` | FROM email zmeny |
| `push-gsheet-proxy.mjs` | Google Sheet proxy workflow |
| `push-ico-scrape.mjs` | ICO scraping workflow |
| `push-imap-fix.mjs` | IMAP fix |
| `push-imap-proxy.mjs` | IMAP proxy workflow |
| `push-reply-dedup.mjs` | Reply deduplikace |
| `push-reply-detection.mjs` | Reply detection workflow |
| `push-smtp-proxy.mjs` | SMTP proxy workflow |
| `push-thread-fix.mjs` | Threading fix |
| `push-tz-fix.mjs` | Timezone fix |
| `push-email-finder-fix.mjs` | Email finder fix |
| `push-contacts-refactor.mjs` | Phase 3 — vsechny workflow refaktorovane na contacts tabulku |
| `push-force-send.mjs` | Force-send workflow |

Kazdy push skript:
1. Nacte JSON soubor workflow
2. Odstrani `pinData` a nastavi `active: false`
3. Odesle PUT do n8n API (deaktivuje -> aktualizuje -> aktivuje)

### Krok 3.4 — Organizace workflow

**Cil:** Pridat tagy pro prehledne razeni v n8n UI.

**Postup:**

```bash
cd n8n-workflows
node organize.mjs
```

**Vysledek:** Workflow jsou otagovane a serazene v n8n.

---

## 4. Nasazeni na VPS

### Krok 4.1 — Nasadit UI

**Cil:** Sestavit a nahrat UI na produkci.

**Predpoklady:**
- SSH klic `~/.ssh/vps_deploy_key`
- Vyplneny `.env.local` (vcetne vsech `VITE_*` promennych)

**Postup:**

```bash
cd outreach-ui
npm run build          # TypeScript kompilace + Vite build → dist/
node deploy-ssh2.mjs   # Upload dist/ na VPS pres SFTP
```

Deploy skript:
1. Pripoji se na VPS `72.62.53.244:22` jako `root` pres SSH klic `~/.ssh/vps_deploy_key`
2. Nahraje cely adresar `dist/` do `/docker/outreach-ui/dist`
3. Restartuje Docker kontejner `outreach-ui-outreach-ui-1`

**Vysledek:** Nova verze UI bezi na produkci.

> **TIP:** Pokud SSH klic neni nalezen, skript pouzije promennou `VPS_PASS` pro heslo.

> **Caste chyby:**
> - Zapomenuti na `npm run build` pred deploy — skript nahraje starou verzi
> - Chybejici `VITE_*` promenne pri buildu — frontend se sestavi bez pripojeni k backendu

### Krok 4.2 — Nasadit IMAP Proxy

**Cil:** Spustit IMAP proxy mikrosluzbu na VPS.

**Predpoklady:**
- SSH pristup k VPS
- IMAP credentials pro vsechny obchodniky

**Postup:**

1. Vytvorte `imap-proxy/config.json` podle `config.example.json`:

```json
{
  "credentials": {
    "Salesman IMAP 1": {
      "host": "imap.example.com",
      "port": 993,
      "user": "email@example.com",
      "pass": "heslo"
    }
  }
}
```

2. Nasadte:

```bash
cd imap-proxy
node deploy.mjs
```

**Vysledek:** Proxy bezi na `127.0.0.1:3001` (pristupna pouze v Docker siti jako `http://imap-proxy:3001`).

> **POZOR:** Na VPS musite nastavit promennou `PROXY_AUTH_TOKEN` v `.env` souboru vedle `docker-compose.yml`. Bez ni kontejner nenastartuje.

> **POZOR:** Nazev klice v `config.json` (napr. `"Salesman IMAP 1"`) musi **presne** odpovidat nazvu credential v databazi (`email_accounts.name`). Rozdil v jedinem znaku zpusobi, ze detekce odpovedi nebude fungovat.

### Krok 4.3 — Nasadit SMTP Proxy

**Cil:** Spustit SMTP proxy mikrosluzbu na VPS.

**Predpoklady:**
- SSH pristup k VPS
- SMTP credentials

**Postup:**

1. Vytvorte `smtp-proxy/config.json` podle `config.example.json`:

```json
{
  "credentials": {
    "Burner SMTP": {
      "host": "smtp.example.com",
      "port": 465,
      "secure": true,
      "user": "smtp-uzivatel",
      "pass": "smtp-heslo"
    }
  }
}
```

2. Nasadte:

```bash
cd smtp-proxy
node deploy.mjs
```

**Vysledek:** Proxy bezi na `127.0.0.1:3002` (pristupna v Docker siti jako `http://smtp-proxy:3002`).

> **POZOR:** Na VPS musite nastavit promennou `PROXY_AUTH_TOKEN` v `.env` souboru vedle `docker-compose.yml`. Pouzijte stejny token jako u IMAP proxy.

> **POZOR:** Nazev credential v `config.json` musi presne odpovidat nazvu SMTP credential pouzitemu v n8n workflow.

### Krok 4.4 — Pridani noveho emailoveho uctu

**Cil:** Pridat novy IMAP/SMTP ucet do systemu.

**Postup:**

1. Pridejte zaznam do tabulky `email_accounts` v Supabase (SMTP i IMAP credentials)
2. Credentials jsou automaticky dostupne proxim z DB — restart neni potreba
3. Volitelne: pokud pouzivate legacy `config.json`, pridejte zaznamy do `imap-proxy/config.json` a `smtp-proxy/config.json` na VPS a restartujte kontejnery

> **TIP:** Hodnota `email_accounts.name` musi presne odpovidat nazvu credential predavanemu proxim (`credential_name` v POST requestu).

---

## 5. Supabase Setup (nova instalace)

> **POZOR:** Tato sekce je urcena pouze pro uplne novou instalaci. Pokud jiz mate existujici Supabase projekt, preskocte na sekci 6.

### Krok 5.1 — Databazove schema

**Cil:** Vytvorit vsechny tabulky, funkce, triggery a RLS politiky.

**Predpoklady:**
- Vyplnene `SUPABASE_URL` a `SUPABASE_SERVICE_ROLE_KEY` v `.env.local`

**Postup:**

```bash
cd n8n-workflows
node db-setup.mjs
```

**Vysledek:** 24 tabulek, RPC funkce, triggery a RLS politiky vytvoreny v Supabase.

### Krok 5.2 — Migrace

**Cil:** Spustit vsechny databazove migrace.

**Postup:**

```bash
cd n8n-workflows

# Spustit migrace v poradi:
node migrate-bugfixes.mjs
node migrate-catchall.mjs
node migrate-contact-lead.mjs
node migrate-diacritics-fix.mjs
node migrate-master-db.mjs
node migrate-per-seq-schedule.mjs
node migrate-reorder-rpc.mjs
node migrate-reply-dedup.mjs
node migrate-thread-subject.mjs
node migrate-ui.mjs
node migrate-view-seq-dates.mjs
node migrate-vocative.mjs
node migrate-wave-delete-cascade.mjs
node migrate-wf4-jednatels-rpc.mjs
node migrate-template-overhaul.mjs
node migrate-audit-fixes.mjs
node migrate-to-config.mjs
node migrate-retarget.mjs
node migrate-vazeny.mjs
node migrate-rls.mjs
node migrate-refresh-salutations.mjs
node migrate-security-definer.mjs
node migrate-reply-detection.mjs
node migrate-lead-delete-cascade.mjs
node migrate-dedup.mjs
node migrate-dedup-fix.mjs
node migrate-from-email.mjs
node migrate-companies-rpc.mjs
node migrate-companies.mjs
node migrate-auto-complete-waves.mjs
node migrate-scheduling-report.mjs
node migrate-team-lockout.mjs
```

> **POZOR:** Vsechny migrace jiz byly provedeny na produkci. Nespoustejte je znovu na existujicim prostredi — mohly by zpusobit duplicitni sloupce nebo konflikty.

**Dulezite migrace (popis):**

| Migrace | Popis |
|---------|-------|
| `migrate-from-email.mjs` | Presunula FROM e-mail do `waves.from_email`; denni limity do `teams` |
| `migrate-drop-outreach-accounts.sql` | Odstranila tabulku `outreach_accounts` (nahrazena `email_accounts` s SMTP+IMAP credentials) |
| `migrate-companies.mjs` | Vytvorila tabulky `companies`, `contacts`, `company_tags`; pridala FK vazby |
| `migrate-companies-rpc.mjs` | Nove RPC funkce (`get_contacts_for_company`, `get_contacts_for_lead`, `mark_contacts_email_status`) |
| `migrate-scheduling-report.mjs` | Pridava sloupec `scheduling_report` (jsonb) do tabulky `waves` |
| `migrate-team-lockout.mjs` | Pridava sloupec `retarget_lockout_days` (integer) do tabulky `teams` |
| `migrate-auto-complete-waves.mjs` | Funkce `auto_complete_waves()` pro automaticke dokonceni vln |
| `migrate-vocative.mjs` | Cesky vokativ — trigger `trg_auto_salutation` na `jednatels` a `contacts` |
| `migrate-rls.mjs` | Row Level Security politiky pro vsechny tabulky |

### Krok 5.3 — Seedovani dat

**Cil:** Vlozit pocatecni konfiguracni hodnoty.

**Postup:**

```bash
cd n8n-workflows
node seed.mjs
```

**Vysledek:** Tabulka `config` naplnena vychozimi hodnotami (QEV klice, seznam_from_email atd.).

### Krok 5.4 — Vytvoreni admin uzivatele

**Cil:** Vytvorit prvniho administratora.

**Postup:**

```bash
cd n8n-workflows
node create-admin.mjs
```

**Vysledek:** Uzivatel vytvoren v Supabase Auth i v tabulce `profiles`.

### Alternativa — Kompletni setup jednim prikazem

Vsechny kroky 5.1 az 5.4 najednou:

```bash
cd n8n-workflows
node setup-all.mjs
```

> **TIP:** `setup-all.mjs` spusti `db-setup.mjs`, vsechny migrace, `seed.mjs` a `create-admin.mjs` v jednom behu.

---

## 6. Prehled promennych prostredi

### Soubor `.env.local` (koren repozitare)

| Promenna | Pouziva | Popis |
|----------|---------|-------|
| `N8N_BASE_URL` | Skripty, UI | Zakladni URL n8n API (napr. `http://72.62.53.244:32770`) |
| `N8N_API_KEY` | Skripty | Autentizace n8n REST API |
| `N8N_MCP_BEARER` | n8n webhooky | Bearer token pro webhook autentizaci |
| `SUPABASE_URL` | Skripty | URL Supabase projektu |
| `SUPABASE_PROJECT_REF` | Skripty | Referencni ID Supabase projektu |
| `SUPABASE_SERVICE_ROLE_KEY` | Skripty | Servisni klic Supabase (plny pristup) |
| `SUPABASE_MANAGEMENT_TOKEN` | Skripty | Token pro Supabase Management API |
| `HOSTINGER_API_TOKEN` | MCP nastroje | API token pro spravu VPS |
| `VPS_IP` | Deploy skripty | IP adresa VPS (`72.62.53.244`) |
| `VITE_SUPABASE_URL` | UI (frontend) | Supabase URL pro prohlizec |
| `VITE_SUPABASE_ANON_KEY` | UI (frontend) | Supabase anon klic pro prohlizec |
| `VITE_N8N_WEBHOOK_URL` | UI (frontend) | n8n webhook URL pro volani z UI |
| `VITE_WEBHOOK_SECRET` | UI (frontend) | Secret pro webhook autentizaci |

### Proxy promenne (na VPS v Docker `.env`)

| Promenna | Pouziva | Popis |
|----------|---------|-------|
| `PROXY_AUTH_TOKEN` | IMAP/SMTP proxy | Bearer token pro proxy autentizaci — nastavit na VPS v `.env` u docker-compose |

### Runtime konfigurace (tabulka `config` v Supabase)

| Klic | Popis |
|------|-------|
| `seznam_from_email` | FROM adresa pro Seznam overeni (WF5) |
| `qev_api_key_1` | QEV API klic 1 (rotace) |
| `qev_api_key_2` | QEV API klic 2 (rotace) |
| `qev_api_key_3` | QEV API klic 3 (rotace) |

---

## 7. CI/CD pipeline

Projekt obsahuje GitHub Actions workflow v `.github/workflows/ci.yml`. Pipeline bezi automaticky na kazdem push a pull requestu do vetve `main`:

1. **Lint** — `npm run lint`
2. **Typecheck** — `npx tsc -b --noEmit`
3. **Test** — `npm test` (Vitest)
4. **Build** — `npm run build`

> **TIP:** Pokud CI pipeline selze na pull requestu, zkontrolujte logy v GitHub Actions a opravte problemy pred mergem.

---

## Slovnicek

| Pojem | Vysvetleni |
|-------|-----------|
| **VPS** | Virtual Private Server — virtualni server na Hostinger (`72.62.53.244`), kde bezi cely system |
| **Docker** | Kontejnerizacni platforma — kazda sluzba (n8n, UI, IMAP proxy, SMTP proxy) bezi v izolovanem kontejneru |
| **SSH** | Secure Shell — zabezpecene pripojeni k VPS pro spravu a deploy (klic: `~/.ssh/vps_deploy_key`) |
| **SFTP** | SSH File Transfer Protocol — zabezpeceny prenos souboru na VPS |
| **n8n** | Open-source automatizacni platforma — bezi self-hosted na VPS, spousti vsechny workflow |
| **Supabase** | Backend-as-a-Service — PostgreSQL databaze, autentizace, RLS, RPC funkce |
| **Anon klic** | Verejny klic Supabase pro frontend — omezeny pristup pres RLS politiky |
| **Service role klic** | Servisni klic Supabase — plny pristup, pouziva se pouze na backendu a ve skriptech |
| **Bearer token** | Autentizacni token v HTTP hlavicce — pouziva se pro zabezpeceni webhook a proxy volani |
| **Push skript** | Helper skript (`push-*.mjs`), ktery nahraje workflow JSON do n8n pres API |
| **Migrace** | Skript (`migrate-*.mjs`), ktery zmeni databazove schema (pridani sloupcu, tabulek, funkci) |
| **Companies** | Master CRM tabulka firem — centralni evidence, na kterou se vazou leady i kontakty |
| **Contacts** | Tabulka kontaktnich osob firem (nahrazuje `jednatels`) — vazba pres `company_id` |
| **Leads** | Emailova outreach vrstva — kazdy lead je napojen na firmu (`company_id`) |
| **Wave** | Vlna odesilani — sada leadu s definovanym FROM emailem, sablonami a rozvrhem |
| **IMAP proxy** | Mikrosluzba na VPS (`port 3001`) pro cteni emailu — resi problem n8n, ktery oznacuje emaily jako prectene |
| **SMTP proxy** | Mikrosluzba na VPS (`port 3002`) pro odesilani emailu — umoznuje threading hlavicky (Message-ID, In-Reply-To, References) |
| **RLS** | Row Level Security — Supabase mechanismus pro omezeni pristupu k datum podle prihlaseneho uzivatele |
| **RPC** | Remote Procedure Call — volani databazovych funkci pres Supabase API |
| **Vokativ** | 5. pad v cestine — pouziva se v osloveni (`Vrazeny pane Novaku`) |
| **env.mjs** | Sdileny modul v `n8n-workflows/`, ktery nacita promenne z `../.env.local` pro vsechny skripty |

---

*Posledni aktualizace: 2026-03-17*
