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
| Operator | Hledat e-maily | [Email Finder](#4-email-finder) |
| Operator | Pouzit retarget pool | [Retarget pool](#5-retarget-pool) |
| Admin | Spravovat uzivatele | [Sprava uzivatelu](#6-sprava-uzivatelu) |
| Admin | Sledovat stav systemu | [Monitoring](#7-monitoring) |
| Kdokoliv | Resit problem | [Reseni problemu](#8-reseni-problemu-faq) |
| Kdokoliv | Vysvetleni pojmu | [Slovnicek](#slovnicek) |

---

## Referencni tabulka — stavy

### Stavy leadu

| Stav | Barva | Vyznam |
|------|-------|--------|
| `new` | Seda | Nove pridany lead, ceka na obohaceni |
| `enriching` | Zluta | Probiha dohledani v ARES |
| `enriched` | Zluta | Jednatele nalezeni, ceka na generovani e-mailu |
| `email_discovery` | Modra | Probiha generovani e-mailovych adres |
| `email_verified` | Modra | E-maily overeny, ceka na rozhodnuti QEV |
| `ready` | Zelena | Lead pripraveny k zarazeni do vlny |
| `in_wave` | Fialova | Lead je soucasti aktivni vlny |
| `completed` | Zelena tmava | Vsechny e-maily odeslany |
| `replied` | Zelena jasna | Odpoved prijata |
| `bounced` | Cervena | E-mail nedorucitelny |
| `failed` | Cervena tmava | Obohaceni selhalo |
| `needs_review` | Oranzova | Vyzaduje rucni kontrolu (catch-all domena) |

### Stavy vlny

| Stav | Barva | Vyznam |
|------|-------|--------|
| `draft` | Seda | Koncept — pripravuje se |
| `verifying` | Zluta | Probiha overovani e-mailu leadu |
| `verified` | Modra | Vsechny e-maily overeny, pripraveno k planovani |
| `scheduled` | Modra tmava | Naplanovano, ceka na odeslani |
| `sending` | Fialova | Probiha odesilani |
| `done` / `completed` | Zelena | Vsechny e-maily odeslany |
| `paused` | Oranzova | Pozastaveno operatorem |

---

# Cast 1 — Prehled dennich operaci

Typicky den operatora:

1. **Rano:** Zkontrolovat dashboard (`/prehled`) — nove odpovedi, stav vln
2. **Firmy:** Zkontrolovat databazi firem (`/databaze`) — prehled vsech firem v CRM, detail firmy na `/databaze/:id`
3. **Leady:** Pridat nove leady (`/leady`) — system je automaticky obohati a propoji s firmou
4. **Vlny:** Zkontrolovat prubeh aktivnich vln (`/vlny`) — odeslane/cekajici/chyby
5. **Odpovedi:** Zpracovat nove odpovedi — viditelne na detailu vlny i leadu
6. **Retarget:** Presunout leady bez odpovedi do retarget poolu pro opetovne osloveni

---

# Cast 2 — Detailni postupy

## 1. Pridani noveho obchodnika / e-mailoveho uctu

### Krok 1.1 — Pridat IMAP credentials

**Cil:** Umoznit systemu cist prichozi e-maily noveho obchodnika.

**Pouze pro roli Admin:** Vyzaduje SSH pristup k VPS.

**Predpoklady:**
- IMAP pristupove udaje noveho obchodnika (host, port, uzivatel, heslo)
- SSH pristup k VPS

**Postup:**

1. Pripojte se na VPS a otevrete soubor `/docker/imap-proxy/config.json`
2. Pridejte novy zaznam:

```json
{
  "credentials": {
    "Salesman IMAP 1": { "..." },
    "Salesman IMAP 2": {
      "host": "imap.example.com",
      "port": 993,
      "user": "novy-obchodnik@example.com",
      "pass": "heslo"
    }
  }
}
```

3. Restartujte kontejner:

```bash
docker restart imap-proxy
```

**Vysledek:** IMAP proxy nyni kontroluje schranku noveho obchodnika.

> POZOR: Nazev klice (napr. `"Salesman IMAP 2"`) musi presne odpovidat tomu, co pozdeji zadane do databaze v poli `salesmen.imap_credential_name`.

### Krok 1.2 — Pridat SMTP credentials

**Cil:** Umoznit systemu odesilat e-maily z noveho uctu.

**Pouze pro roli Admin:** Vyzaduje SSH pristup k VPS.

**Postup:**

1. Otevrete `/docker/smtp-proxy/config.json` na VPS
2. Pridejte novy zaznam:

```json
{
  "credentials": {
    "Burner SMTP": { "..." },
    "Salesman SMTP 2": {
      "host": "smtp.example.com",
      "port": 465,
      "secure": true,
      "user": "novy-obchodnik@example.com",
      "pass": "heslo"
    }
  }
}
```

3. Restartujte:

```bash
docker restart smtp-proxy
```

**Vysledek:** SMTP proxy nyni umi odesilat z noveho uctu.

### Krok 1.3 — Pridat obchodnika v UI

**Cil:** Zaregistrovat obchodnika v systemu.

**Predpoklady:** Kroky 1.1 a 1.2 dokonceny.

**Postup:**

1. Prejdete na **Nastaveni > Obchodnici** (`/nastaveni/obchodnici`)
2. Kliknete na "Pridat obchodnika"
3. Vyplnte jmeno, e-mail a prirazeni k tymu

**Vysledek:** Obchodnik vytvoren v tabulce `salesmen`.

### Krok 1.4 — Nastavit outreach ucet a denni limit

**Cil:** Propojit SMTP credentials s tymem a nastavit denni limit odesilani.

**Predpoklady:** Obchodnik pridan v kroku 1.3.

**Postup:**

1. Prejdete na **Nastaveni > Outreach ucty** (`/nastaveni/ucty`)
2. Nastavte nazev SMTP credential presne podle `config.json`
3. Prejdete na **Nastaveni > Tymy** (`/nastaveni/tymy`)
4. Nastavte `daily_send_limit` pro dany tym (denni limit odesilani)

**Vysledek:** Tym muze odesilat e-maily. Denni limit je sledovan na urovni tymu (`teams.sends_today`).

> POZNAMKA: FROM e-mail se nastavuje primo na kazde vlne (pole `from_email`) — neni to vlastnost outreach uctu. Viz krok 2.2.

> Caste chyby:
> - Preklep v nazvu credential — musi presne odpovidat (case-sensitive, vcetne mezer)
> - Zapomenuti restartovat Docker kontejner po zmene config.json
> - Pridani vice nez 5 aktivnich obchodniku (limit enforced triggerem `check_max_salesmen`)

---

## 2. Vytvareni a planovani e-mailovych vln

### Krok 2.1 — Pripravit leady

**Cil:** Overit, ze leady jsou pripraveny k osloveni.

**Predpoklady:** Leady musi byt ve stavu `ready` (obohacene s overenou e-mailovou adresou).

**Postup:**

1. Prejdete na **Leady** (`/leady`)
2. Filtrujte podle stavu "ready"
3. Zkontrolujte, ze leady maji overeny e-mail

> TIP: Pokud lead "uvaznul" v nejakem stavu, zkontrolujte sekci [Reseni problemu](#obohaceni-leadu-uvaznulo).

#### Detekce duplicit

Vsechny tri zpusoby pridavani leadu (rucni pridani, CSV import, Google Sheet import) kontroluji duplicity pred ulozenim:

- **Rucni pridani:** Pokud existuje lead se shodnym ICO, domenou, e-mailem nebo nazvem firmy, zobrazi se chybova hlaska a lead nebude pridan.
- **CSV / Google Sheet import:** Po kliknuti na "Spustit import" probehne kontrola duplicit. Pokud se najdou shody, zobrazi se review krok s tabulkou duplicitnich radku. Uzivatel muze potvrdit preskoceni duplicit a import zbylych leadu.

Kontrola probiha globalne (pres vsechny tymy) a porovnava 4 pole: ICO, domena, e-mailova adresa, nazev firmy (bez ohledu na velikost pismen).

### Krok 2.2 — Vytvorit vlnu

**Cil:** Zalozit novou e-mailovou kampan.

**Postup:**

1. Prejdete na **Vlny** (`/vlny`)
2. Kliknete na "Vytvorit vlnu"
3. Vyplnte:
   - **Tym** — ktery tym vlnu odesila
   - **Sada sablon** — e-mailova sekvence k pouziti
   - **FROM e-mail** — odesilaci adresa (volny text s autocomplete naseptavacem z drive pouzitych adres)
   - **Nastaveni** — casovani sekvenci

**Vysledek:** Vlna ve stavu `draft`.

> POZNAMKA: Denni limit odesilani se nastavuje na urovni tymu (Nastaveni > Tymy), ne na vlne. FROM e-mail je volne textove pole — muzete zadat libovolnou adresu, ktera odpovida SMTP credentials.

### Krok 2.3 — Pridat leady do vlny

**Cil:** Prirazit leady ke kampani.

**Predpoklady:** Vlna ve stavu `draft`.

**Postup:**

1. Otevrete detail vlny (`/vlny/:id`)
2. Kliknete na "Pridat leady"
3. Vyberte leady ze seznamu (pouze leady se stavem `ready` a overenym e-mailem)

**Vysledek:** Leady prirazeny do vlny, jejich stav se zmeni na `in_wave`.

### Krok 2.4 — Naplanovani vlny

**Cil:** Spustit odesilani.

**Predpoklady:** Leady pridany a overeny.

**Postup:**

1. Na detailu vlny kliknete "Naplanovat"
2. System spusti **WF7** (planovani vlny), ktery:
   - Vytvori zaznamy v `email_queue` pro kazdy lead x sekvenci
   - Nastavi stav vlny na `scheduled`

**Vysledek:** Vlna naplanovana, e-maily se zacnou odesilat automaticky.

### Krok 2.5 — Sledovani odesilani

**Cil:** Monitorovat prubeh kampane.

**WF8** (odesilaci cron) bezi kazdych 5 minut:
- Prevezme davku e-mailu z fronty pres `claim_queued_emails()` (atomicky)
- Nacte `from_email` z vlny (`waves.from_email`) a denni limit z tymu (`teams.daily_send_limit`)
- Zkontroluje denni limit pres `increment_and_check_sends(p_team_id)` — operuje na tabulce `teams`
- Odesle pres SMTP proxy
- Zaznamenavdo `sent_emails`
- Zavola `auto_complete_waves()` po dokonceni

**Jak sledovat:** Na detailu vlny vidite pocty odeslanych/cekajicich/chybnych e-mailu v realnem case (pres Supabase realtime subscriptions).

> TIP: Sequence timing — po seq1 se seq2 planuje s 3dennim odstupem, po seq2 se seq3 planuje s 5dennim odstupem. Tyto intervaly lze nastavit na vlne.

---

## 3. Sprava sablon

### Sady sablon (Template sets)

**Cil:** Spravovat skupiny e-mailovych sablon.

**Pouze pro roli Admin:** Pristupne v **Nastaveni > Sablony** (`/nastaveni/sablony`).

Kazda sada sablon obsahuje sablony organizovane podle:
- **Sekvence** (seq1, seq2, seq3) — poradi e-mailu v kampani
- **A/B varianta** (A nebo B) — pro split testovani

### Dostupne promenne v sablonach

| Promenna | Zdroj | Priklad |
|----------|-------|---------|
| `{{salutation}}` | `contacts.salutation` (nebo `jednatels.salutation` pro starsi leady) | `Vazeny pane Novaku` |
| `{{company_name}}` | `companies.company_name` (nebo `leads.company_name`) | `ACME s.r.o.` |
| `{{first_name}}` | `contacts.first_name` | `Jan` |
| `{{last_name}}` | `contacts.last_name` | `Novak` |

> TIP: Pouzivejte `{{salutation}},` primo v sablone — osloveni uz obsahuje predponu "Vazeny pane" / "Vazena pani". Nepridavejte predponu znovu.

### Editor sablon

Editor pouziva **Tiptap** (rich text editor). Podporuje:
- HTML formatovani
- Drag-and-drop razeni sekvenci
- Nahled pred odeslanim

---

## 4. Email Finder

**Cil:** Vyhledat e-mailovou adresu osoby nebo overit existujici adresu.

**Pristupne na:** `/email-finder`

Email Finder ma 4 rezimy (zobrazene jako podzalozky v postrannim panelu):

| Rezim | Zalozka | Popis |
|-------|---------|-------|
| **Podle ICO** | Vychozi | Vyhleda jednatele v ARES podle ICO, odhadne e-mail z domeny a overi pres SMTP |
| **Podle jmena** | `?tab=name` | Vygeneruje mozne e-mailove adresy ze jmena a domeny, overi pres SMTP |
| **Overit e-mail** | `?tab=verify` | Overi, zda konkretni e-mailova adresa existuje (SMTP + MX check) |
| **Prima sonda** | `?tab=probe` | Odesle sondovaci e-mail a ceka na odraz (~3 min). Spolehlive pro catch-all domeny |

**Postup (rezim Podle ICO):**

1. Prejdete na **Email Finder** (`/email-finder`)
2. Zadejte ICO (8 cislic) a webovou adresu firmy
3. Kliknete "Hledat"
4. System vyhleda jednatele v ARES, vygeneruje e-mailove vzory a overi je
5. Vysledky se zobrazi primo na strance s moznosti kopirovani a exportu CSV

**Postup (rezim Prima sonda):**

1. Prepnete na zalozku "Prima sonda"
2. Zadejte jmeno osoby a domenu firmy
3. Kliknete "Sondovat"
4. System odesle testovaci e-maily a ceka na odraz (~3 minuty)
5. Po dokonceni pouzijte tlacitko "Recheck odrazu" pro aktualizaci vysledku

> TIP: U catch-all domen (kde SMTP server prijme jakykoliv e-mail) je Prima sonda spolehlivejsi nez SMTP overeni — skutecne odesle testovaci zpravou a sleduje, zda se vrati.

> TIP: Vysledky se ukladaji do historie hledani (v ramci session) — muzete se k nim kdykoliv vratit.

---

## 5. Retarget pool

**Cil:** Opetovne oslovit leady, ktere neodpovedly.

**Pristupne na:** `/retarget`

Lead se dostane do retarget poolu, kdyz:
- Vlna skonci bez odpovedi od leadu
- Operator lead rucne presune do poolu

**Postup pro opetovne osloveni:**

1. Prejdete na retarget pool (`/retarget`)
2. Vyberte leady k opetovnemu osloveni
3. Vytvorte novou vlnu s jinou sadou sablon
4. Pridejte vybrane leady do nove vlny

> TIP: Pouzijte jinou sadu sablon nez pri prvnim osloveni — zmenena komunikace zvysuje sanci na odpoved.

---

## 6. Sprava uzivatelu

### Role v systemu

| Role | Pristup |
|------|---------|
| **Admin** | Plny pristup — nastaveni, tymy, uzivatele, sablony, vsechny operace |
| **Bezny uzivatel** | Leady, vlny, dashboard, email finder (bez pristupu k nastaveni) |

### Pridani uzivatele

**Pouze pro roli Admin:** Pristupne v **Nastaveni > Uzivatele** (`/nastaveni/uzivatele`).

**Postup:**

1. Prejdete na stranku spravy uzivatelu
2. Kliknete "Pridat uzivatele"
3. Vyplnte e-mail, heslo a roli (admin / bezny uzivatel)

**Vysledek:** System vytvori uzivatele v Supabase Auth i zaznam v tabulce `profiles`.

> TIP: Sprava uzivatelu probehne pres webhook `wf-admin-users` — zmeny se projevi okamzite.

---

## 7. Monitoring

### 7.1 — Detekce odpovedi

**WF9** bezi kazdou minutu:

1. Zavola IMAP proxy (`/check-inbox`) pro kazdy obchodnicky credential
2. Sparuje odpovedi s odeslanyimi e-maily pres Message-ID threading (In-Reply-To / References)
3. Zaznamenavdo tabulky `lead_replies`
4. Aktualizuje `wave_lead` stav na `replied`
5. Deduplikuje pres tabulku `processed_reply_emails`

**Kde zkontrolovat odpovedi:** Na detailu vlny nebo detailu leadu v UI.

### 7.2 — Monitorovani bouncu / NDR

Dva workflow monitoruji bouncy:

| Workflow | Co kontroluje |
|----------|--------------|
| **wf-ndr-monitor** | INBOX — Non-Delivery Report zpravy |
| **wf-ndr-monitor-spam** | Spam slozka — bounce zpravy presmerovane do spamu |

Bouncy se zaznamenavaji do `email_probe_bounces`. Stare zaznamy maze WF10 kazdy den.

### 7.3 — Denni reset (WF10)

Bezi v pulnoci:
- Zavola `reset_daily_sends()` — vynuluje `teams.sends_today` na 0 pro vsechny tymy
- Smaze stare zaznamy z `email_probe_bounces`

### 7.4 — Health checky

Obe proxy maji health endpointy:

| Sluzba | Endpoint | Overeni z VPS |
|--------|----------|---------------|
| IMAP Proxy | `GET http://imap-proxy:3001/health` | `curl http://localhost:3001/health` |
| SMTP Proxy | `GET http://smtp-proxy:3002/health` | `curl http://localhost:3002/health` |

> TIP: Obe proxy maji Docker healthcheck — Docker automaticky monitoruje stav a restartuje kontejner po 3 neuspesnych kontrolach (interval 30s).

### 7.4b — Graceful shutdown

Obe proxy podporuji kontrolovane ukonceni:

- Pri `docker stop` (SIGTERM) dokonci rozpracovane pozadavky (max 10s timeout)
- SMTP proxy navic zavre vsechny cache SMTP transportery
- Zabranuje ztracenym IMAP spojenim a nedokoncenym odesilkam

### 7.5 — Konfiguracni tabulka

Tabulka `config` v Supabase obsahuje runtime konfiguraci:

| Klic | Ucel | Priklad |
|------|------|---------|
| `seznam_from_email` | Odesaci e-mail pro SMTP VRFY dotazy (WF5) | `verify@example.com` |
| `qev_api_key_1` | QEV API klic (1. rotacni slot) | `qev_abc123...` |
| `qev_api_key_2` | QEV API klic (2. rotacni slot) | `qev_def456...` |
| `qev_api_key_3` | QEV API klic (3. rotacni slot) | `qev_ghi789...` |

> TIP: QEV klice se rotují automaticky — WF6 cykluje pres vsechny tri, aby rozlozil zatez API.

---

## 8. Reseni problemu (FAQ)

### E-maily se neodessilaji

| Mozna pricina | Jak overit | Reseni |
|---------------|-----------|--------|
| E-maily uvazly ve fronte | Zkontrolujte `email_queue` v Supabase — hledejte stav `queued` nebo `sending` | Pockejte na dalsi beh WF8 (kazdych 5 min) |
| SMTP proxy nefunguje | SSH na VPS: `curl http://localhost:3002/health` | Restartujte: `docker restart smtp-proxy` |
| Dosazeny denni limit | Funkce `increment_and_check_sends(p_team_id)` blokuje (limit na tabulce `teams`) | Pockejte na pulnocni reset, nebo rucne vynulujte `teams.sends_today` v databazi |
| Chyba ve WF8 | Otevrete n8n UI, zkontrolujte historii spusteni WF8 | Opravte chybu podle logu |
| Nesedi nazev credential | SMTP credential v `outreach_accounts` nesouhlasi s `smtp-proxy/config.json` | Opravte nazev tak, aby presne odpovidal |

### Odpovedi se nedetekuji

| Mozna pricina | Jak overit | Reseni |
|---------------|-----------|--------|
| IMAP proxy nefunguje | SSH na VPS: `curl http://localhost:3001/health` | Restartujte: `docker restart imap-proxy` |
| Nesedi nazev credential | `salesmen.imap_credential_name` nesouhlasi s `imap-proxy/config.json` | Opravte nazev |
| Chyba pripojeni v WF9 | Zkontrolujte historii spusteni WF9 v n8n | Opravte IMAP nastaveni |
| Chybi threading hlavicky | Odpoved nema `In-Reply-To` nebo `References` odpovidajici `sent_emails.message_id` | Nelze resit — zavisí na e-mailovem klientu odesílatele |
| Uz zpracovano | Odpoved je v tabulce `processed_reply_emails` | Ocekavane chovani — deduplikace funguje spravne |

### Obohaceni leadu uvaznulo

| Mozna pricina | Jak overit | Reseni |
|---------------|-----------|--------|
| Workflow neni aktivni | Zkontrolujte v n8n UI, ze WF2-WF6 jsou aktivni | Aktivujte prislusny workflow |
| Webhook nedostupny | UI vola n8n pres webhook — zkontrolujte, ze n8n je dostupne | Restartujte n8n kontejner |
| ARES API nedostupne | Zkontrolujte `enrichment_log` pro dany lead | Pockejte a zkuste znovu (docasny vypadek) |
| Zmena struktury kurzy.cz | WF3 scrapuje HTML — zmena webu zpusobi chybu | Aktualizujte scrapovaci logiku ve WF3 |
| Konkretni krok selhal | Podivejte se na `enrichment_log` pro lead_id | Opravte podle chybove zpravy v logu |

### Vlna se nedokonci

| Mozna pricina | Jak overit | Reseni |
|---------------|-----------|--------|
| Uvazle wave_leads | Zkontrolujte `wave_leads` — hledejte neterminalní stavy | Opravte stav rucne |
| auto_complete_waves() nefunguje | WF8 tuto funkci vola po kazdem behu — zkontrolujte logy | Zkontrolujte chybu ve funkci |
| Chybne e-maily | Nektere `wave_leads` jsou ve stavu `failed` | Prozkoumejte pricinu a zkuste znovu nebo preskocte |
| Rucni dokonceni | — | Na detailu vlny v UI oznacte jako dokoncene |

### Docker kontejnery nefunguji

**Postup diagnostiky:**

```bash
# 1. Zkontrolujte stav kontejneru
docker ps -a | grep -E "imap-proxy|smtp-proxy|outreach-ui"

# 2. Podivejte se na logy
docker logs imap-proxy --tail 50
docker logs smtp-proxy --tail 50

# 3. Zkontrolujte Docker healthcheck stav
docker inspect --format='{{.State.Health.Status}}' imap-proxy
docker inspect --format='{{.State.Health.Status}}' smtp-proxy

# 4. Restartujte
docker restart imap-proxy smtp-proxy
```

> TIP: Docker healthcheck monitoruje `/health` endpoint kazdych 30 sekund. Pokud 3 kontroly za sebou selzou, kontejner se oznaci jako unhealthy a `restart: unless-stopped` ho automaticky restartuje.

### Problemy s pripojenim k databazi

| Mozna pricina | Jak overit | Reseni |
|---------------|-----------|--------|
| Supabase vypadek | Navstivte Supabase dashboard | Pockejte na obnovu |
| Neplatny service role klic | Zkontrolujte `SUPABASE_SERVICE_ROLE_KEY` v `.env.local` | Aktualizujte klic |
| RLS politiky blokuji dotaz | Dotaz vraci prazdne vysledky | Zkontrolujte RLS politiky v Supabase |

---

## Slovnicek

| Pojem | Vysvetleni |
|-------|-----------|
| **Firma (Company)** | Master CRM zaznam firmy — centralni evidence v tabulce `companies`, pristupna na `/databaze` |
| **Kontakt (Contact)** | Kontaktni osoba firmy — ulozena v tabulce `contacts`, navazana na firmu (nahrazuje jednatels) |
| **Lead** | Firma nebo kontakt urceny k osloveni — identifikovan ICO, nazvem nebo jmenem, propojen s firmou pres `company_id` |
| **Jednatel** | Statutarni organ firmy (reditel, jednatel) — legacy pojem, v novem modelu nahrazen pojmem "kontakt" |
| **Vlna (Wave)** | E-mailova kampan — seskupeni leadu, kteri dostanou sekvenci az 3 e-mailu |
| **Sekvence** | Poradi e-mailu v kampani: seq1 (prvni osloveni) → seq2 (+3 dny) → seq3 (+5 dni) |
| **Template set** | Sada e-mailovych sablon — 3 sekvence x 2 A/B varianty |
| **Obohaceni** | Automaticky proces doplneni dat: ARES → kontakty (contacts) → e-maily → overeni |
| **Retarget pool** | Sbirka leadu bez odpovedi, pripravenych k opetovnemu osloveni |
| **Bounce / NDR** | Nedorucitelny e-mail — adresa neexistuje nebo server odmitl zpravou |
| **Claim** | Atomicke prevzeti e-mailu z fronty — zabranni duplicitnimu odeslani |
| **Threading** | Provazani e-mailu v konverzaci pres hlavicky Message-ID, In-Reply-To, References |
| **Health check** | Kontrola, ze sluzba (proxy) bezi a odpovida spravne |
| **RLS** | Row-Level Security — zabezpeceni pristpupu k datum na urovni radku v databazi |
| **Credential** | Pristupove udaje (login, heslo) ulozene v konfiguraci proxy nebo n8n |
| **Cron** | Casovy planovac — workflow bezi automaticky v nastavenych intervalech |

---

*Posledni aktualizace: brezen 2026*
