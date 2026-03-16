# Provozni prirucka

> Tato prirucka popisuje kazdodenni operace se systemem Czech B2B Email Outreach.
> **Cast 1** je rychly prehled. **Cast 2** obsahuje detailni postupy.

---

## Navigace

| Jsem... | Chci... | Prejdete na... |
|---------|---------|----------------|
| Operator | Pridat noveho obchodnika | [Pridani obchodnika](#1-pridani-noveho-obchodnika--e-mailoveho-uctu) |
| Operator | Vytvorit a odeslat vlnu | [Vytvareni vln](#2-vytvareni-a-planovani-e-mailovych-vln) |
| Operator | Spravovat sablony | [Sprava sablon](#3-sprava-sablon) |
| Operator | Pouzit retarget pool | [Retarget pool](#4-retarget-pool) |
| Operator | Importovat leady | [Import leadu](#6-import-leadu) |
| Operator | Hledat e-maily | [Email Finder](#7-email-finder) |
| Admin | Spravovat uzivatele | [Sprava uzivatelu](#5-sprava-uzivatelu) |
| Admin | Sledovat stav systemu | [Monitoring](#8-monitoring) |
| Kdokoliv | Resit problem | [Reseni problemu](#9-reseni-problemu-faq) |
| Kdokoliv | Vysvetleni pojmu | [Slovnicek](#slovnicek) |

---

## Referencni tabulka — stavy

### Stavy leadu

| Stav | Cesky nazev | Barva | Ikona | Vyznam |
|------|-------------|-------|-------|--------|
| `new` | novy | zelena (accent) | ✓ | Nove pridany lead, ceka na obohaceni |
| `enriching` | obohacuje se | oranzova | ⚠ | Probiha ARES lookup / kurzy scraping |
| `enriched` | obohacen | oranzova | ⚠ | ICO a kontakty nalezeny, ceka na email discovery |
| `email_discovery` | hledani emailu | zluta | ⚠ | Generuji se e-mailove kandidaty |
| `email_verified` | email overen | zelena | ✓ | E-mail uspesne provereny (Seznam / QEV) |
| `ready` | pripraven | zelena | ✓ | Lead je plne pripraveny k zarazeni do vlny |
| `in_wave` | ve vlne | fialova | ◴ | Lead je aktualne zarazen v aktivni vlne |
| `completed` | dokonceno | zelena | ✓ | Vsechny sekvence odeslany, kampan dokoncena |
| `replied` | odpovedeno | azurova (cyan) | ℹ | Prijata odpoved od kontaktu |
| `bounced` | bounce | cervena | ✗ | E-mail se odrazil (tvrdy / mekky bounce) |
| `failed` | selhalo | cervena | ✗ | Obohaceni nebo odeslani selhalo |
| `needs_review` | ceka na kontrolu | oranzova | ⚠ | Vyzaduje manualni posouzeni operatorem |
| `problematic` | problemovy | cervena | ✗ | Opakovane problemy, lead odlozen |
| `info_email` | info email | azurova (cyan) | ℹ | Nalezen pouze genericky email (info@, office@ apod.) |
| `staff_email` | staff email | fialova | ◴ | Nalezen email zamestnance (ne jednatele) |

### Stavy vln

| Stav | Cesky nazev | Barva | Ikona | Vyznam |
|------|-------------|-------|-------|--------|
| `draft` | koncept | seda (muted) | ● | Vlna vytvorena, jeste nenaplanovana |
| `verifying` | overovani | zluta | ⚠ | Probiha overovani emailu ve vlne |
| `verified` | overeno | azurova (cyan) | ℹ | Vsechny emaily overeny, pripraveno k planovani |
| `scheduled` | naplanovano | zelena (accent) | ✓ | Vlna naplanovana, ceka na cas odeslani |
| `sending` | odesila se | oranzova | ⚠ | WF8 aktivne odesila emaily z fronty |
| `done` | hotovo | zelena | ✓ | Vsechny emaily z fronty odeslany |
| `completed` | dokonceno | zelena | ✓ | Vlna plne dokoncena (vcetne vsech sekvenci) |
| `paused` | pozastaveno | zluta | ⚠ | Vlna rucne pozastavena operatorem |

### Stavy wave-leadu

| Stav | Cesky nazev | Barva | Vyznam |
|------|-------------|-------|--------|
| `pending` | ceka | seda | Lead ve vlne, jeste nebyl odeslan zadny email |
| `seq1_sent` | seq. 1 odeslano | zelena (accent) | Prvni sekvence odeslana |
| `seq2_sent` | seq. 2 odeslano | zelena (accent) | Druha sekvence odeslana |
| `seq3_sent` | seq. 3 odeslano | fialova | Treti (posledni) sekvence odeslana |
| `completed` | dokonceno | zelena | Vsechny sekvence pro tento lead odeslany |
| `replied` | odpovedeno | azurova (cyan) | Lead odpodel na email |
| `failed` | selhalo | cervena | Odeslani pro tento lead selhalo |

### Stavy fronty emailu

| Stav | Cesky nazev | Barva | Vyznam |
|------|-------------|-------|--------|
| `queued` | ve fronte | zelena (accent) | Email ceka na odeslani |
| `sending` | odesila se | oranzova | Email se prave odesila |
| `sent` | odeslano | zelena | Uspesne odeslano |
| `failed` | selhalo | cervena | Odeslani selhalo |
| `cancelled` | zruseno | seda | Email byl zrusen (napr. po odpovedi) |
| `pending_prev` | ceka na predchozi | seda | Ceka na dokonceni predchozi sekvence |

> **TIP:** Komponenta `StatusBadge` zobrazuje ke kazdemu stavu ikonu pristupnosti (✓, ✗, ⚠, ℹ, ◴, ●), takze barvo-slepy uzivatel rozlisi stav i bez barev.

---

# Cast 1 — Prehled dennich operaci

## Typicky den operatora

| Cas | Cinnost | Kde v UI |
|-----|---------|----------|
| Rano | Zkontrolovat dashboard — pocty odeslanych, odpovedi, bounce rate | `/prehled` (7d/30d/vse prepinac) |
| Rano | Overit stav systemu — fronta, selhavelost, denni limity | `/system` |
| Rano | Projit nekonzistence — leady ve stavu `needs_review` | `/leady` + filtr stavu |
| Dopoledne | Import novych leadu (CSV, Google Sheet, rucne) | `/leady` → tlacitko Import |
| Dopoledne | Vytvorit novou vlnu, pridat leady, naplanovat odeslani | `/vlny` → Nova vlna |
| Poledne | Zkontrolovat prubeh odesilani — aktivni vlny na dashboardu | `/prehled` → Aktivni vlny |
| Odpoledne | Projit odpovedi (stav `replied`) a reagovat | `/leady` + filtr `replied` |
| Odpoledne | Zkontrolovat bounce a selhavelost | `/system` + detail vlny |
| Prubezne | Pouzit Email Finder pro ad-hoc overeni | `/email-finder` |
| Prubezne | Retarget pool — oslovit leady po lockout periode | `/retarget` |

> **POZOR:** Denni limity se automaticky resetuji o pulnoci (WF10). Pokud vidite `sends_today` vyssi nez limit, WF10 zrejme nedobehl — viz sekce Monitoring.

---

# Cast 2 — Detailni postupy

## 1. Pridani noveho obchodnika / e-mailoveho uctu

### Cil

Pridat do systemu noveho obchodnika (salesman) se schopnosti prijimat odpovedi a odesilat emaily.

### Predpoklady

- Pristup k VPS (SSH)
- Pristupove udaje IMAP a SMTP pro novy e-mailovy ucet
- Admin pristup do n8n

### Postup

#### Krok 1 — Nastavit IMAP credentials na VPS

1. Pripojte se k VPS: `ssh -i ~/.ssh/vps_deploy_key root@<VPS_IP>`
2. Otevirete soubor `/root/imap-proxy/config.json`
3. Pridejte novy zaznam:

```json
{
  "Salesman IMAP X": {
    "host": "imap.example.com",
    "port": 993,
    "user": "obchodnik@firma.cz",
    "password": "heslo-imap",
    "tls": true
  }
}
```

4. Restartujte IMAP proxy: `docker restart imap-proxy`

> **TIP:** Nazev klice (napr. `Salesman IMAP X`) musi presne odpovidat nazvu IMAP credentialu, ktery pozdeji zadavate v UI.

#### Krok 2 — Nastavit SMTP credentials na VPS

1. Otevirete soubor `/root/smtp-proxy/config.json`
2. Pridejte novy zaznam:

```json
{
  "Salesman SMTP X": {
    "host": "smtp.example.com",
    "port": 465,
    "user": "obchodnik@firma.cz",
    "password": "heslo-smtp",
    "secure": true
  }
}
```

3. Restartujte SMTP proxy: `docker restart smtp-proxy`

#### Krok 3 — Pridat obchodnika v UI

1. Jdete na `/nastaveni/obchodnici`
2. Kliknete **+ Novy obchodnik**
3. Vyplnte:
   - **Jmeno**: cele jmeno obchodnika
   - **E-mail**: e-mailova adresa (pouzije se jako Reply-To)
   - **IMAP credential**: nazev odpovidajici klici v `imap-proxy/config.json`
   - **Tym**: priradeny tym
   - **Aktivni**: zapnuto
4. Ulozte

> **POZOR:** Maximalni pocet aktivnich obchodniku je 5 na system. Pri pokusu pridat dalsiho se zobrazi chyba.

#### Krok 4 — Pridat Outreach ucet

1. Jdete na `/nastaveni/ucty`
2. Kliknete **+ Novy ucet**
3. Vyplnte:
   - **E-mailova adresa**: stejna adresa jako u obchodnika
   - **Nazev SMTP credentialu**: nazev odpovidajici klici v `smtp-proxy/config.json`
   - **Tym**: priradeny tym (kazdy tym muze mit max 1 outreach ucet)
   - **Denni limit odeslani**: volitelne (limit na ucet, navic k limitu tymu)
4. Ulozte

### Vysledek

Novy obchodnik muze byt prirazen k vlnam. Odpovedi doruci WF9 pres IMAP proxy, odchozi emaily jdou pres SMTP proxy.

---

## 2. Vytvareni a planovani e-mailovych vln

### Cil

Vytvorit vlnu, naplnit ji leady, pridat e-mailovou sablonu a naplanovat odeslani.

### Predpoklady

- Pripravene leady ve stavu `ready` nebo `email_verified`
- Sada sablon s alespon jednou sekvenci
- Aktivni obchodnik prirazeny k tymu

### Postup

#### Krok 1 — Pripravit leady

1. Jdete na `/leady`
2. Vyfiltrujte leady podle stavu (`ready` nebo `email_verified`)
3. Overite, ze leady maji overeny email (zeleny badge)
4. Volitelne: zkontrolujte kontakty a osloveni (salutation)

#### Krok 2 — Vytvorit vlnu

1. Jdete na `/vlny`
2. Kliknete **+ Nova vlna**
3. Vyplnte:
   - **Nazev vlny**: popisny nazev (napr. "IT firmy Praha Q1 2026")
   - **Tym**: prirazeny tym
   - **Sada sablon**: vyberte predpripravenou sadu
   - **FROM email**: e-mailova adresa odesilatele (volny text — nemusı byt outreach ucet)
   - **Obchodnik**: kdo bude mit Reply-To
4. Vytvorte vlnu (bude ve stavu `draft`)

#### Krok 3 — Pridat leady do vlny

1. Otevirete detail vlny
2. Kliknete **Pridat leady**
3. V dialogu vybirejte leady (muzete vyhledavat, filtrovat)
4. Potvrdte vyber

> **TIP:** Pokud se nektery lead nelze pridat (napriklad nema overeny email), zobrazi se ve **Scheduling reportu** jako preskoceny s duvodem. Tuto informaci najdete na detailu vlny.

#### Krok 4 — Naplanovat odeslani

1. Na detailu vlny kliknete **Naplanovat**
2. Nastavte datum a cas zahajeni
3. Potvrdte

Vlna prejde do stavu `scheduled`. V naplanovany cas WF8 (cron kazdou minutu) zacne odesilat emaily z fronty.

#### Krok 5 — Monitorovat prubeh

1. Na dashboardu (`/prehled`) sledujte tabulku **Aktivni vlny**
2. Na detailu vlny vidite:
   - Pocet odeslanychch emailu / celkem
   - Stav kazdeho leadu ve vlne
   - Preskocene leady s duvodem (scheduling report)
   - Selahne emaily s tlacitkem **Opakovat**

### Vysledek

Emaily se odesilaji postupne. Po kazde sekvenci system ceka nastavenou prodlevu pred dalsi. Po odeslani vsech sekvenci se vlna automaticky dokonci (`auto_complete_waves`).

---

## 3. Sprava sablon

### Cil

Vytvorit a upravovat sady e-mailovych sablon (template sets) s vice sekvencemi a A/B variantami.

### Predpoklady

- Pristup k sekci Nastaveni

### Postup

#### Vytvoreni sady sablon

1. Jdete na `/nastaveni/sablony`
2. Kliknete **+ Nova sablona**
3. Zadejte nazev sady a priradeny tym
4. Automaticky se vytvori 3 sekvence (seq 1/2/3), kazda s variantou A a B

#### Uprava sablony

1. Kliknete na nazev sady → otevre se detail `/sablony/{id}`
2. Pro kazdou sekvenci (1-3) a variantu (A/B):
   - **Predmet**: predmet emailu
   - **Telo**: HTML obsah emailu (rich-text editor)
3. Ulozte kazdou zmenu

#### Dostupne promenne v sablonach

| Promenna | Vyznam | Priklad |
|----------|--------|---------|
| `{{salutation}}` | Formalni osloveni v 5. padu | "Vazeny pane Novaku" |
| `{{company_name}}` | Nazev firmy | "ABC s.r.o." |
| `{{first_name}}` | Krestni jmeno kontaktu | "Jan" |
| `{{last_name}}` | Prijmeni kontaktu | "Novak" |
| `{{domain}}` | Domena firmy | "abc.cz" |
| `{{website}}` | Webova adresa firmy | "https://abc.cz" |
| `{{ico}}` | ICO firmy | "12345678" |

> **TIP:** Promenna `{{salutation}}` obsahuje kompletni formalni osloveni vcetne "Vazeny pane / Vazena pani" a jmena v 5. padu (vokativu). V sablone staci napsat `{{salutation}},` a dalsi text.

> **POZOR:** Sadu sablon nelze smazat, pokud je pouzivana aktivni vlnou. Nejprve vlnu dokonecte nebo odpojte sablonu.

---

## 4. Retarget pool

### Co to je

Retarget pool je automaticky generovany seznam leadu, kteri byli v minulosti osloveni, ale uplynula **lockout perioda** od posledniho kontaktu. Tyto leady je mozne znovu zaradit do nove vlny.

### Lockout perioda

- Vychozi: **120 dni** od posledniho kontaktu
- Nastavitelna **per-tym**: `/nastaveni/tymy` → Upravit tym → **Retarget lockout (dny)**
- Lead se objevi v poolu az po uplynuti lockout periody

### Pouziti

1. Jdete na `/retarget`
2. Prohledejte / vyfiltrujte leady (fulltextove hledani, filtr podle tymu)
3. U kazdeho leadu vidite:
   - Nazev firmy, ICO, kontakty
   - Nazev posledni vlny
   - Datum posledniho kontaktu
   - Celkovy pocet osloveni
   - Datum odemknuti (odkdy je lead k dispozici)
4. Rozbalovaci radek ukazuje **historii vln** — vsechny vlny, ve kterych lead byl
5. Vyberte leady (checkbox) a kliknete **Retarget vlna (N)**
6. Otevre se dialog pro vytvoreni nove vlny s predvybranymi leady v retarget rezimu

> **TIP:** Pool se automaticky plni. Neni treba nic nastavovat — staci jen nastavit lockout periodu na tymu.

---

## 5. Sprava uzivatelu

### Cil

Pridat nebo spravovat uzivatele systemu.

### Predpoklady

- Admin role (pouze admini vidi sekci Uzivatele)

### Postup

#### Pridani uzivatele

1. Jdete na `/nastaveni/uzivatele`
2. Kliknete **+ Novy uzivatel**
3. Vyplnte:
   - **Cele jmeno**: jmeno a prijmeni
   - **E-mail**: prihlasovaci e-mail
   - **Heslo**: pocatecni heslo
   - **Tym**: prirazeny tym
   - **Admin**: zapnout, pokud ma mit administratorska opravneni
4. Kliknete **Vytvorit**

#### Role

| Role | Opravneni |
|------|-----------|
| Bezny uzivatel | Leady, vlny, sablony, import, email finder, retarget pool — vse v ramci sveho tymu |
| Admin | Vse vise + sprava uzivatelu, sprava tymu, systemova nastaveni, pristup ke vsem tymum |

#### Zmena hesla

- Admin muze zmenit heslo libovolneho uzivatele pres jeho kartu
- Kazdy uzivatel si muze zmenit vlastni heslo v nastaveni

---

## 6. Import leadu

System nabizi tri zpusoby importu leadu.

### 6.1 Import z CSV

**Cil:** Hromadne naimportovat leady ze souboru CSV.

**Postup:**

1. Jdete na `/leady`
2. Kliknete **Import** → **CSV import**
3. Nahrajte CSV soubor (podporovane oddelovace: carka, strednik, tabulator)
4. System automaticky detekuje sloupce. Rucne upresete mapovani:
   - `company_name` — nazev firmy (povinny)
   - `ico` — ICO firmy
   - `website` — webova adresa
   - `contact_name` — jmeno kontaktu
   - `email` — e-mailova adresa
5. Vyberte **tym**
6. Zvolte **uroven obohaceni**:

| Uroven | Popis | Pouziti |
|--------|-------|---------|
| `import_only` | Jen ulozit data do databaze | Kdyz uz mate emaily a nepotrebujete obohaceni |
| `find_emails` | Vyhledat emaily (generovani + overeni) | Kdyz mate nazvy firem / weby, ale ne emaily |
| `full_pipeline` | Kompletni pipeline (ARES + kurzy + email gen + overeni) | Kdyz mate jen nazvy firem nebo ICO |

7. Kliknete **Dalsi** → system zkontroluje duplicity
8. Zobrazi se nahled — pocet novych vs. duplikatu
9. Potvrdte import

> **TIP:** Kontrola duplicit porovnava ICO, domenu a nazev firmy. Duplicity se automaticky preskoci.

### 6.2 Import z Google Sheetu

**Cil:** Importovat leady primo z Google tabulky.

**Postup:**

1. Kliknete **Import** → **Google Sheet**
2. Vlozte URL Google tabulky (musi byt sdilena jako "Kdokoliv s odkazem")
3. System nacte data pres proxy workflow (WF13)
4. Mapovani, uroven obohaceni a kontrola duplicit — stejne jako u CSV importu
5. Potvrdte import

> **POZOR:** Tabulka musi byt verejne dostupna (alespon pro cteni). Pokud se zobrazi chyba, overite nastaveni sdileni.

### 6.3 Rucni pridani leadu

**Cil:** Pridat jednotlivy lead primo v UI.

**Postup:**

1. Jdete na `/leady`
2. Kliknete **+ Novy lead**
3. Vyplnte:
   - **Nazev firmy** (povinny)
   - **Kontaktni osoba** (povinne)
   - **ICO** (volitelne)
   - **Web** (volitelne)
   - **E-mail** (volitelne — pokud nevyplnite, pouzije se obohaceni)
4. **Checkbox "Vyhledat email"** — kdyz je zapnuty a e-mail neni vyplneny, system automaticky spusti email discovery pipeline (potrebuje web nebo ICO)
5. Kliknete **Pridat**

> **TIP:** Pokud vyplnite e-mail rucne, lead se vytvori primo ve stavu `ready`. Pokud zapnete obohaceni, projde stavem `enriching` → `enriched` → `email_discovery` → `email_verified` → `ready`.

---

## 7. Email Finder

### Co to je

Samostatny nastroj pro vyhledavani a overovani e-mailovych adres. Pristupny na `/email-finder`. Stranka ma dve zakladky.

### Zakladka "Najit emaily" (`?tab=find`)

- **Backend:** wf-email-finder-v3 (n8n ID: KRWLgqTf5ILqSNpk)
- **Webhook:** `POST /webhook/wf-email-finder-v3`
- **Vstup:** Libovolna kombinace: `input` (volny text), `company_id`, `company_name`, `ico`, `domain`, `website`
- **Postup:**
  1. Resolves firmu — domain lookup, ARES, firmy.cz fallback
  2. Nacte vsechny kontakty firmy
  3. Vygeneruje emailove patterny pro kazdy kontakt
  4. Provede SMTP check kazdeho kandidata
  5. Probe test na catch-all domeny
  6. Scrapne web firmy pro backup emaily (info@, kontakt@, apod.)
  7. Vsechny nalezene emaily upsertne do `email_candidates`
- **Pouziti:** Hlavni firemne-centricke hledani emailu. Zadejte nazev firmy, ICO, domenu nebo web a system najde vsechny dostupne emaily.
- Vstupni domena se cisti pres sub-workflow **sub-clean-domain** (n8n ID: 9H3NH7YbR1X2Efgm) a na frontendu pres `cleanDomainInput()` v `outreach-ui/src/lib/dedup.ts`

### Zakladka "Overit email" (`?tab=verify`)

- **Backend:** wf-email-finder-v2 (n8n ID: 6sc6c0ZSuglJ548A)
- **Vstup:** Konkretni e-mailova adresa
- **Postup:** Overi, zda e-mail existuje (MX check + SMTP probe)
- **Pouziti:** Pro rychle overeni konkretni adresy

> **POZN:** Stare zakladky ICO, Name, Probe a Bulk byly odstraneny. Jejich funkcionalita je nyni soucasti zakladky "Najit emaily" (v3 orchestrator).

### Akce s vysledky

| Akce | Popis |
|------|-------|
| **Kopirovat vse** | Zkopiruje vsechny nalezene emaily do schranky |
| **Export CSV** | Stahne vysledky jako CSV soubor |
| **Kopirovat** (u emailu) | Zkopiruje jednotlivy email |

---

## 8. Monitoring

### 8.1 Detekce odpovedi (WF9)

- **Workflow:** WF9 (reply detection), bezi kazdou minutu
- **Jak funguje:** Kontroluje IMAP schranky vsech aktivnich obchodniku pres IMAP proxy
- **Pri nalezeni odpovedi:**
  - Lead se prepne do stavu `replied`
  - Odpoved se ulozi do `lead_replies`
  - E-mail se oznaci v `processed_reply_emails` (neopakuje se)
  - Neparovane odpovedi jdou do `unmatched_replies`

### 8.2 NDR monitoring

- **Workflow:** wf-ndr-monitor + wf-ndr-monitor-spam
- **Jak funguje:** Sleduje INBOX a spam slozku pro NDR (Non-Delivery Reports)
- **Pri nalezeni NDR:**
  - Lead se prepne do stavu `bounced`
  - Bounce se zaznmena do `email_probe_bounces`

### 8.3 Denni reset (WF10)

- **Workflow:** WF10, spousti se o pulnoci
- **Co dela:**
  - Resetuje `teams.sends_today` na 0 (pres RPC `reset_daily_sends()`)
  - Maze stare zaznamy z `email_probe_bounces`

### 8.4 Stranka stavu systemu (`/system`)

Pristupna na `/system`. Zobrazuje:

| Metrika | Popis | Cervena, kdyz |
|---------|-------|---------------|
| **Ve fronte** | Pocet emailu cekajicich na odeslani | > 100 |
| **Odesila se** | Pocet emailu, ktere se prave odesilaji | — |
| **Selhane (24h)** | Pocet selhanychch emailu za poslednich 24 hodin | > 0 |
| **Posledni odeslani** | Cas posledniho uspesne odeslaneho emailu | > 10 min |

**Denni limity odesilani** — progress bar pro kazdy tym:
- Zeleny: < 70 % limitu
- Zluty: 70-90 % limitu
- Cerveny: > 90 % limitu

**Stav sluzeb:**
- **WF8 (Send Cron)** — zelena, pokud posledni odeslani bylo pred mene nez 10 minutami
- **Fronta emailu** — zelena, pokud < 10 selhani za 24h

Data se automaticky obnovuji kazdych 15 sekund. Tlacitko **Obnovit** vynuti okamzitou aktualizaci.

### 8.5 Selhanelost — Failed emails

V detailu vlny (`/vlny/{id}`) najdete:
- Tabulku selhalych emailu
- Kazdy radek ma tlacitko **Opakovat** (retry) pro opetovne zarazeni do fronty
- Informace o duvodu selhani

### 8.6 Dashboard filtrování

Na dashboardu (`/prehled`) je prepinac casoveho rozsahu:

| Tlacitko | Rozsah |
|----------|--------|
| **7d** | Poslednich 7 dni |
| **30d** | Poslednich 30 dni |
| **Vse** | Celkove statistiky od zacatku |

Zobrazované metriky:
- Celkem leadu
- Overenych emailu
- Odeslanychch emailu
- Mira odpovedi (pocet + procento)
- Graf odeslanychch emailu v case
- Odpovedi podle vln
- Odpovedi podle sablon
- Tabulka aktivnich vln

---

## 9. Reseni problemu (FAQ)

### Emaily se neodesılaji

| Mozna pricina | Jak overit | Reseni |
|---------------|------------|--------|
| WF8 (send cron) neni aktivni | Zkontrolujte v n8n admin (`/workflow/wJLD5sFxddNNxR7p`) | Aktivujte workflow |
| WF8 trigger odpojeny (connection mismatch) | Spustte `node n8n-workflows/diagnose-wave-send.mjs` — pokud executions trvaji ~20ms misto 200ms+, trigger neni propojeny s dalsimi nody | Opravte connection key v `wf8-send-cron.json` (musi odpovidat jmenu trigger nodu) a pushnte pres `update.mjs` |
| Denni limit vyčerpan | `/system` → Denni limity | Pocejte na reset o pulnoci, nebo zvyste limit v `/nastaveni/tymy` |
| SMTP proxy nefunguje | SSH na VPS → `docker logs smtp-proxy` | `docker restart smtp-proxy`, zkontrolujte `config.json` |
| Fronta je prazdna | `/system` → Ve fronte = 0 | Zkontrolujte, ze vlna je ve stavu `scheduled` nebo `sending` |
| Chyba SMTP credentials | Detail selhanelostho emailu → duvod | Overite SMTP udaje v `smtp-proxy/config.json` na VPS |
| Vlna zrusena pred casem odeslani | Zkontrolujte `email_queue` status — vsechny `cancelled` | Uzivatel zrusil vlnu pred tim, nez emaily dosahly `scheduled_at`. Preplante znovu. |

### Odpovedi se nedetekuji

| Mozna pricina | Jak overit | Reseni |
|---------------|------------|--------|
| WF9 neni aktivni | Zkontrolujte v n8n admin (`/workflow/AaHXknYh9egPDxcG`) | Aktivujte workflow |
| IMAP proxy nefunguje | SSH → `docker logs imap-proxy` | `docker restart imap-proxy`, zkontrolujte `config.json` |
| Obchodnik nema IMAP credential | `/nastaveni/obchodnici` | Doplnte IMAP credential name |
| Email je v `processed_reply_emails` | Zkontrolujte tabulku v Supabase | Pokud zpracovan, ale neprirazen → podivejte se do `unmatched_replies` |

### Obohaceni se zaseklo

| Mozna pricina | Jak overit | Reseni |
|---------------|------------|--------|
| WF1-WF5, WF11 neni aktivni | Zkontrolujte v n8n admin | Aktivujte prislusny workflow |
| ARES API neni dostupne | Zkuste rucne `https://ares.gov.cz/` | Pocejte a zkuste znovu |
| Lead se zasekl ve stavu `enriching` | `/leady` → filtr `enriching` | Rucne prepnte stav na `new` a spustte znovu |

### Vlna se nedokoncuje

| Mozna pricina | Jak overit | Reseni |
|---------------|------------|--------|
| Nektery wave-lead je stale `pending` | Detail vlny → seznam leadu | Zkontrolujte, zda emaily pro tyto leady prosly frontou |
| `auto_complete_waves` selhava | Supabase → logy funkce | Zkontrolujte SQL funkci, overite podminky dokonceni |
| Vlna je `paused` | Detail vlny | Odpauzujte vlnu |

### Docker problemy na VPS

| Mozna pricina | Jak overit | Reseni |
|---------------|------------|--------|
| Kontejner spadl | `docker ps -a` na VPS | `docker start <container_name>` |
| Port je obsazeny | `docker logs <container>` | Zastavte kolidujici proces, restartujte kontejner |
| Disk plny | `df -h` na VPS | Procistete logy: `docker system prune` |
| Config neplatny | `docker logs <container>` → JSON parse error | Overite `config.json` — platny JSON, spravne uvozovky |

### Problemy s pripojenim k databazi

| Mozna pricina | Jak overit | Reseni |
|---------------|------------|--------|
| Supabase je nedostupne | Zkuste Supabase dashboard | Pocejte na obnoveni sluzby |
| Neplatny API klic | Chyba 401 v konzoli prohlizece | Overite `SUPABASE_ANON_KEY` v `.env.local` |
| RLS politiky blokuji pristup | Chyba v konzoli — prazdna data | Zkontrolujte RLS politiky v Supabase |

> **Caste chyby:**
> - Toast notifikace se zobrazuji po dobu **8 sekund** pro bezne chyby. **Kriticke chyby** zustanou viditelne neomezeně (duration: Infinity).
> - Pokud vidite prazdnou stranku, zkuste obnovit prohlizec (Ctrl+F5) — muze jit o cachovany stary build.

---

## Slovnicek

| Pojem | Vysvetleni |
|-------|------------|
| **Lead** | Kontakt na firmu urceny k e-mailovemu osloveni. Obsahuje nazev firmy, ICO, domenu, stav. |
| **Company** | Zakladni zaznam firmy v CRM databazi (`/databaze`). Jeden company muze mit vice leadu. |
| **Contact** | Kontaktni osoba prirazena k firme (nahraza starsi tabulku `jednatels`). |
| **Jednatel** | Statutarni organ firmy. System ho automaticky hleda v ARES a kurzy.cz. |
| **Vlna (Wave)** | Kampan — sada leadu + sablona + casovy plan odeslani. |
| **Wave lead** | Propojeni leadu s vlnou — sleduje stav odeslani pro kazdy lead v dane vlne. |
| **Sekvence (Sequence)** | Poradi emailu v ramci vlny (seq 1 = prvni email, seq 2 = follow-up, seq 3 = posledni). |
| **Varianta (A/B)** | Kazda sekvence muze mit dve varianty pro A/B testovani. |
| **Template set** | Sada sablon — obsahuje sekvence 1-3, kazda s variantami A/B. |
| **Salutation** | Formalni osloveni v 5. padu ("Vazeny pane Novaku"). Generuje se automaticky z `full_name`. |
| **Vokativ** | Paty pad v ceske gramatice. System aplikuje pravidla sklonovani automaticky. |
| **Outreach ucet** | E-mailovy ucet pouzivany k odesilani (1 na tym). |
| **Obchodnik (Salesman)** | Osoba, jejiz email se pouziva jako Reply-To. Ma vlastni IMAP schranku. |
| **Enrichment** | Proces obohaceni leadu — ARES lookup, kurzy scraping, generovani emailu, overeni. |
| **Enrichment pipeline** | Retez workflowu WF1 → WF2 → WF3 → WF4 → WF5 → WF11 pro kompletni obohaceni. WF6 (QEV) je deaktivovany. Leady bez ICO ale s domenou preskoci WF3 a jdou primo na WF4. WF4, WF5 i WF11 pouzivaji get_contacts_for_lead() RPC pro nacitani kontaktu. WF5 nastavuje seznam_status='verified' (drive 'likely_valid') a is_verified=true pro SMTP-overene emaily. WF11 rozpoznava oba statusy. **Dual-strictness:** WF5 je strikni (combo emaily — vyzaduje smtp_result='valid'), WF11 je lenientni (website-scraped emaily — odmitne jen smtp_result='invalid'). |
| **Email discovery** | Proces hledani emailove adresy — generovani kandidatu + SMTP overeni. |
| **QEV** | QuickEmailVerification — externi sluzba pro overovani emailu. **Deaktivovana** — SMTP overeni v WF5 dava stejne vysledky. |
| **Seznam verify** | Overeni emailu pres Seznam.cz SMTP servery. Uspesne overene emaily dostanou seznam_status='verified' a is_verified=true. |
| **SMTP probe** | Pokus o doruceni testovacıho emailu pro overeni existence adresy. |
| **Catch-all domena** | Domena, ktera prijima emaily na libovolnou adresu — SMTP overeni neni prukazne. Email Finder v3 automaticky detekuje catch-all a pouzije probe test. |
| **Email Finder v3** | Novy firemni orchestrator (wf-email-finder-v3) — nahrazuje stare zakladky ICO/Name/Probe/Bulk jednim company-centric hledanim. |
| **NDR** | Non-Delivery Report — automaticka zprava o nedoruceni emailu (bounce). |
| **Bounce** | Odrazeny email — adresa neexistuje nebo je nedostupna. |
| **Lockout perioda** | Casove obdobi po poslednim kontaktu, behem ktereho nelze lead znovu oslovit. |
| **Retarget pool** | Seznam leadu, u nichz uplynula lockout perioda a mohou byt znovu osloveni. |
| **Retarget round** | Poradove cislo opetovneho osloveni leadu. |
| **IMAP proxy** | Docker mikrosluzba na VPS, ktera bezpecne cte IMAP schranky bez oznacovani jako prectene. |
| **SMTP proxy** | Docker mikrosluzba na VPS pro odesilani emailu s podporou threading hlavicek. |
| **Threading** | Provazani emailu ve vlakne (In-Reply-To, References hlavicky). |
| **StatusBadge** | UI komponenta zobrazujici stav s barvou a ikonou pristupnosti. |
| **Blacklist** | Systemovy tag — firma/lead oznaceny jako blacklist je vyloucen z oslovovani. |
| **System tag** | Chranene tagy (blacklist, email outreach, telefon, vip) — nelze smazat. |
| **Daily send limit** | Maximalni pocet emailu, ktere muze tym odeslat za den. Resetuje se o pulnoci. |
| **FROM email** | Adresa odesilatele nastavena primo na vlne (volny text). |
| **Reply-To** | Adresa pro odpovedi — nastavuje se automaticky na email obchodnika z tymu. |

---

> **Posledni aktualizace:** 2026-03-15
