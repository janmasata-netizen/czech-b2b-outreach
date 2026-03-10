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

- [ ] Naklonovat repozitar (`git clone`)
- [ ] Zkopirovat `.env.example` do `.env.local` a vyplnit hodnoty
- [ ] Nainstalovat zavislosti UI (`npm install` v `outreach-ui/`)
- [ ] Spustit UI lokalne (`npm run dev`) a overit prihlaseni
- [ ] Spustit testy (`npm test` v `outreach-ui/`) a overit, ze prochazi
- [ ] Importovat workflow do n8n (`node import.mjs`)
- [ ] Overit, ze vsechny workflow jsou aktivni v n8n UI
- [ ] Nasadit IMAP a SMTP proxy na VPS
- [ ] Nasadit UI na VPS (`npm run build` + `node deploy-ssh2.mjs`)

> TIP: Pokud nastavujete system od nuly (novy Supabase projekt), zacnete nejdriv sekci [5. Supabase Setup](#5-supabase-setup-nova-instalace) a pak se vratte k tomuto checklistu.

---

# Cast 2 — Detailni kroky

## 1. Klonovani a konfigurace

### Krok 1.1 — Klonovat repozitar

**Cil:** Ziskat zdrojovy kod na lokalni pocitac.

**Predpoklady:**
- Nainstalovan Git
- SSH klic pripojen ke GitHub uctu

```bash
git clone git@github.com:janmasata-netizen/czech-b2b-outreach.git
cd czech-b2b-outreach
```

**Vysledek:** Adresar `czech-b2b-outreach/` s celym projektem.

### Krok 1.2 — Nastavit promenne prostredi

**Cil:** Pripravit konfiguraci pro pripojeni ke vsem sluzbam.

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
| `VITE_SUPABASE_URL` | Frontend Supabase URL (stejna jako SUPABASE_URL) | Viz vyse |
| `VITE_SUPABASE_ANON_KEY` | Frontend anon/verejny klic | Supabase Dashboard > Settings > API |
| `VITE_N8N_WEBHOOK_URL` | Frontend n8n webhook URL | Stejna jako N8N_BASE_URL + `/webhook` |
| `VITE_WEBHOOK_SECRET` | Secret pro webhook autentizaci z frontendu | Stejny jako N8N_MCP_BEARER |

> POZOR: Nikdy necommitujte `.env.local` do Gitu. Soubor je v `.gitignore`.

> Caste chyby:
> - Zapomenuti na `/webhook` suffix u `VITE_N8N_WEBHOOK_URL`
> - Zamena `SUPABASE_SERVICE_ROLE_KEY` s `VITE_SUPABASE_ANON_KEY` — kazdy se pouziva jinde
> - Pouziti stareho API klice po regeneraci v n8n

---

## 2. Lokalni vyvoj

### Krok 2.1 — Spustit UI lokalne

**Cil:** Rozbehnout vyvojovy server pro praci na frontendu.

**Predpoklady:**
- Node.js v18+
- Vyplneny `.env.local`

```bash
cd outreach-ui
npm install
npm run dev
```

**Vysledek:** Vyvojovy server na `http://localhost:5173`.

> POZOR: UI validuje povinne promenne prostredi pri startu (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_N8N_WEBHOOK_URL`). Pokud nejsou nastaveny, zobrazi se chybova hlaska misto aplikace.

> TIP: UI cte promenne prostredi z `../.env.local` (nadrazeny adresar) pres Vite konfiguraci. Import alias `@` ukazuje na `./src` — napr. `@/hooks/useLeads` odpovida `src/hooks/useLeads.ts`.

### Krok 2.1b — Spustit testy

**Cil:** Overit, ze codebase je v poradku.

```bash
cd outreach-ui
npm test          # jednorazovy beh (39 testu)
npm run test:watch # sledovani zmen (vyvoj)
```

**Vysledek:** Vsechny testy prochazi. Testy pokryvaji utility, hooky, glass komponenty, AuthProvider a DashboardPage.

### Krok 2.2 — Prace s workflow

**Cil:** Upravit a nasadit workflow soubory.

Workflow JSON soubory jsou v `n8n-workflows/`. Postup uprany:

1. Upravte JSON soubor lokalne
2. Nahrajte do n8n pomoci push skriptu (viz sekce 3)
3. Overte v n8n UI, ze je workflow aktivni a spravny

> TIP: Vsechny helper skripty ctou secrets z `env.mjs` (ktery nacita `../.env.local`). Zadne hardcoded secrets ve skriptech.

---

## 3. Nasazeni workflow do n8n

### Krok 3.1 — Push jednotlivych workflow

**Cil:** Nahrat konkretni workflow do n8n.

**Pouze pro roli Admin:** Tuto operaci muze provadet pouze spravce systemu.

```bash
cd n8n-workflows

# Push konkretniho workflow
node push-wf8.mjs        # WF8 (odesilaci cron)
node push-reply.mjs       # Reply detection workflow
node push-ndr.mjs         # NDR monitor workflow
# ... viz n8n-workflows/push-*.mjs pro vsechny
```

Kazdy push skript:
1. Nacte JSON soubor workflow
2. Odstrani `pinData` a nastavi `active: false`
3. Odesle PUT do n8n API (deaktivuje → aktualizuje → aktivuje)

### Krok 3.2 — Import vsech workflow (nova instance)

**Cil:** Importovat vsechny workflow do ciste n8n instance.

**Pouze pro roli Admin:** Toto spoustejte pouze pri prvni instalaci.

```bash
node import.mjs
```

**Vysledek:** Vsechny workflow nahrane do n8n, bez testovacich dat.

### Krok 3.3 — Aktualizace nejcasteji menenych workflow

**Cil:** Rychla aktualizace WF7, WF8 a WF10.

```bash
node update.mjs
```

### Krok 3.4 — Organizace workflow

**Cil:** Pridat tagy pro prehledne razeni v n8n UI.

```bash
node organize.mjs
```

---

## 4. Nasazeni na VPS

### Krok 4.1 — Nasadit UI

**Cil:** Sestavit a nahrat UI na produkci.

**Pouze pro roli Admin:** Vyzaduje SSH pristup k VPS.

**Predpoklady:**
- SSH klic `~/.ssh/vps_deploy_key`
- Vyplneny `.env.local`

```bash
cd outreach-ui
npm run build          # TypeScript kompilace + Vite build → dist/
node deploy-ssh2.mjs   # Upload dist/ na VPS pres SFTP
```

Deploy skript:
1. Pripoji se na VPS `72.62.53.244:22` jako `root` pres SSH klic
2. Nahraje cely adresar `dist/` do `/docker/outreach-ui/dist`
3. Restartuje Docker kontejner `outreach-ui-outreach-ui-1`

> TIP: Pokud SSH klic neni nalezen, skript pouzije promennou `VPS_PASS` pro heslo.

### Krok 4.2 — Nasadit IMAP Proxy

**Cil:** Spustit IMAP proxy mikrosluzbu na VPS.

**Pouze pro roli Admin:** Vyzaduje SSH pristup k VPS.

**Predpoklady:**
- Pristup na VPS
- IMAP credentials pro vsechny obchodniky

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

**Vysledek:** Proxy bezi na `127.0.0.1:3001` (pristupna pouze v Docker siti).

> POZOR: Na VPS musite nastavit promennou `PROXY_AUTH_TOKEN` v `.env` souboru vedle `docker-compose.yml` (nebo primo v prostredi). Bez ni kontejner nenastartuje.

> POZOR: Nazev klice v `config.json` (napr. `"Salesman IMAP 1"`) musi **presne** odpovidat nazvu credential v databazi (`salesmen.imap_credential_name`). Rozdil v jedinem znaku zpusobi, ze detekce odpovedi nebude fungovat.

### Krok 4.3 — Nasadit SMTP Proxy

**Cil:** Spustit SMTP proxy mikrosluzbu na VPS.

**Pouze pro roli Admin:** Vyzaduje SSH pristup k VPS.

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

**Vysledek:** Proxy bezi na `127.0.0.1:3002`.

> POZOR: Na VPS musite nastavit promennou `PROXY_AUTH_TOKEN` v `.env` souboru vedle `docker-compose.yml` (nebo primo v prostredi). Bez ni kontejner nenastartuje. Pouzijte stejny token jako u IMAP proxy.

> POZOR: Nazev credential v `config.json` musi presne odpovidat `outreach_accounts.smtp_credential_name` v databazi.

---

## 5. Supabase Setup (nova instalace)

> Pouze pro roli Admin: Tato sekce je urcena pouze pro uplne novou instalaci. Pokud jiz mate existujici Supabase projekt, preskocte na sekci 6.

### Krok 5.1 — Databazove schema

**Cil:** Vytvorit vsechny tabulky, funkce, triggery a RLS politiky.

```bash
cd n8n-workflows
node db-setup.mjs
```

### Krok 5.2 — Migrace

**Cil:** Spustit vsechny databazove migrace v poradi.

```bash
node migrate-001-*.mjs
node migrate-002-*.mjs
# ... pokracujte pro vsechny migrate-*.mjs soubory
```

> POZOR: Migraci spoustejte vzdy v poradi podle cisla v nazvu souboru. Preskoceni migrace muze zpusobit chyby.

### Krok 5.3 — Seedovani dat

**Cil:** Vlozit pocatecni konfiguracni hodnoty.

```bash
node seed.mjs
```

### Krok 5.4 — Vytvoreni admin uzivatele

**Cil:** Vytvorit prvniho administratora.

```bash
node create-admin.mjs
```

**Vysledek:** Uzivatel vytvoren v Supabase Auth i v tabulce `profiles`.

### Alternativa — Kompletni setup jednim prikazem

Vsechny kroky 5.1 az 5.4 najednou:

```bash
node setup-all.mjs
```

---

## 6. Prehled promennych prostredi

| Promenna | Pouziva | Popis |
|----------|---------|-------|
| `N8N_BASE_URL` | Skripty, UI | Zakladni URL n8n API |
| `N8N_API_KEY` | Skripty | Autentizace n8n REST API |
| `N8N_MCP_BEARER` | n8n webhooky | Bearer token pro webhook autentizaci |
| `SUPABASE_URL` | Skripty | URL Supabase projektu |
| `SUPABASE_PROJECT_REF` | Skripty | Referencni ID Supabase projektu |
| `SUPABASE_SERVICE_ROLE_KEY` | Skripty | Servisni klic Supabase (plny pristup) |
| `SUPABASE_MANAGEMENT_TOKEN` | Skripty | Token pro Supabase Management API |
| `HOSTINGER_API_TOKEN` | MCP nastroje | API token pro spravu VPS |
| `VPS_IP` | Deploy skripty | IP adresa VPS (72.62.53.244) |
| `VITE_SUPABASE_URL` | UI (frontend) | Supabase URL pro prohlizec |
| `VITE_SUPABASE_ANON_KEY` | UI (frontend) | Supabase anon klic pro prohlizec |
| `VITE_N8N_WEBHOOK_URL` | UI (frontend) | n8n webhook URL pro volani z UI |
| `VITE_WEBHOOK_SECRET` | UI (frontend) | Secret pro webhook autentizaci |
| `PROXY_AUTH_TOKEN` | IMAP/SMTP proxy (Docker) | Bearer token pro proxy autentizaci — nastavit na VPS v `.env` u docker-compose |

---

## 7. CI/CD pipeline

Projekt obsahuje GitHub Actions workflow v `.github/workflows/ci.yml`. Pipeline bezi automaticky na kazdem push a pull requestu do vetve `main`:

1. **Lint** — `npm run lint`
2. **Typecheck** — `npx tsc -b --noEmit`
3. **Test** — `npm test` (Vitest, 39 testu)
4. **Build** — `npm run build`

> TIP: Pokud CI pipeline selze na pull requestu, zkontrolujte logy v GitHub Actions a opravte problemy pred mergem.

---

## Slovnicek

| Pojem | Vysvetleni |
|-------|-----------|
| **VPS** | Virtual Private Server — virtualni server na Hostinger, kde bezi system |
| **Docker** | Kontejnerizacni platforma — kazda sluzba bezi v izolovanem kontejneru |
| **SSH** | Secure Shell — zabezpecene pripojeni k VPS pro spravu a deploy |
| **SFTP** | SSH File Transfer Protocol — zabezpeceny prenos souboru na VPS |
| **Anon klic** | Verejny klic Supabase pro frontend — omezeny pristup pres RLS |
| **Service role klic** | Servisni klic Supabase — plny pristup, pouziva se pouze na backendu |
| **Bearer token** | Autentizacni token v HTTP hlavicce — pouziva se pro zabezpeceni webhook volani |
| **Push skript** | Helper skript, ktery nahraje workflow JSON do n8n pres API |
| **Migrace** | Skript, ktery zmeni databazove schema (pridani sloupcu, tabulek atd.) |

---

*Posledni aktualizace: brezen 2026*
