# Sablony dokumentace

Tyto sablony definuji strukturu pro kazdy generovany dokumentacni soubor. Vsechny texty v cestine. Vyplnte kazdou sekci aktualnimi a presnymi daty z codebase.

---

## architecture.md

```markdown
# Architektura systemu

> Tento dokument popisuje technickou architekturu systemu.
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
[1-2 odstavce — co system dela, hlavni komponenty]

## Ctyri hlavni komponenty
[Tabulka: # | Komponenta | Co dela | Kde bezi]

---

# Cast 2 — Detailni reference

## Diagram architektury
[ASCII diagram s ceskou legendou: Operator -> React UI -> Supabase + n8n -> SMTP/IMAP proxy -> E-mailove servery]

## Komponenty

### 1. n8n (Workflow Engine)
- Hosting, URL, jak se workflow spravuji
- Model autentizace webhooku

### 2. Supabase (Databaze + Auth)
- Detail projektu, co zajistuje (data, auth, RLS, realtime)
[Tabulka: Sluzba | Popis]

### 3. React UI (outreach-ui/)
- Technologicky stack [Tabulka: Technologie | Ucel]
- Stranky aplikace [Tabulka: Cesta | Stranka | Pristup | Ucel]
- React hooky [Tabulka: Hook | Ucel]

> Pouze pro roli Admin: Vsechny stranky v sekci /nastaveni vyzaduji roli administratora.

### 4. IMAP Proxy (imap-proxy/)
- Proc existuje (n8n IMAP bugy)
- API endpointy [Tabulka: Metoda | Cesta | Pozadavek | Odpoved]
- Format konfigurace

### 5. SMTP Proxy (smtp-proxy/)
- Proc existuje (podpora threading hlavicek)
- API endpointy [Tabulka]
- Format konfigurace

## Datove toky

### Pipeline obohaceni leadu
[Krok-po-kroku diagram: ICO/rucni zadani -> WF1 -> WF2 -> WF3 -> WF4 -> WF5 -> WF6 -> ready]

### Pipeline odesilani e-mailu
[Krok-po-kroku diagram: vlna -> WF7 -> WF8 -> WF9 -> WF10]

### Doplnkove workflow
[Tabulka: Workflow | Ucel]

## Reference workflow
[Tabulka: Soubor | n8n ID | Spoustec | Ucel — pro VSECHNY workflow]

## Databazove schema

### Prehled tabulek
[Tabulka: Tabulka | Ucel | Klicove sloupce — pro vsech 19 tabulek]

### Klicove vztahy mezi tabulkami
[Popis cizich klicu a vztahu]

### Databazove funkce
[Tabulka: Funkce | Ucel]

### Databazove triggery
[Tabulka: Trigger | Tabulka | Udalost | Chovani]

### Pravidla ceskeho vokativu
[Tabulka pravidel sklonovani]

## Model zabezpeceni
[Tabulka: Oblast | Mechanismus]

> POZOR: Kazdy novy workflow odesilajici e-maily musi mit options.appendAttribution: false.

## Slovnicek
[Tabulka: Pojem | Vysvetleni — vsechny technicke pojmy v cestine]
```

---

## setup-guide.md

```markdown
# Pruvodce nastavenim

> **Cast 1** je rychly checklist pro prvni den. **Cast 2** obsahuje detailni kroky.

---

## Navigace
| Jsem... | Chci... | Prejdete na... |
|---------|---------|----------------|
[Navigacni tabulka pro ruzne role a ukoly]

---

# Cast 1 — Checklist prvniho dne
[Checkbox seznam kroku v poradi]

> TIP: Pokud nastavujete system od nuly, zacnete sekci Supabase Setup.

---

# Cast 2 — Detailni kroky

## 1. Klonovani a konfigurace

### Krok 1.1 — Klonovat repozitar
**Cil:** [...]
**Predpoklady:** [...]
[prikazy]
**Vysledek:** [...]

### Krok 1.2 — Nastavit promenne prostredi
**Cil:** [...]
[Tabulka: Promenna | Popis | Kde ji najdete]

> POZOR: Nikdy necommitujte .env.local do Gitu.
> Caste chyby: [seznam castych chyb]

## 2. Lokalni vyvoj

### Krok 2.1 — Spustit UI lokalne
**Cil:** [...]
**Predpoklady:** [...]
[prikazy]
**Vysledek:** [...]

> TIP: [uzitecna rada]

### Krok 2.2 — Prace s workflow
[postup]

## 3. Nasazeni workflow do n8n

### Krok 3.1 — Push jednotlivych workflow
**Pouze pro roli Admin:** [...]
[prikazy, vysvetleni]

### Krok 3.2 — Import vsech workflow (nova instance)
**Pouze pro roli Admin:** [...]

### Krok 3.3 — Aktualizace nejcasteji menenych workflow
### Krok 3.4 — Organizace workflow

## 4. Nasazeni na VPS

### Krok 4.1 — Nasadit UI
**Pouze pro roli Admin:** [...]
**Predpoklady:** [...]
[prikazy]

> TIP: [fallback pro SSH klic]

### Krok 4.2 — Nasadit IMAP Proxy
**Pouze pro roli Admin:** [...]
[konfigurace + deploy]

> POZOR: Nazev klice v config.json musi presne odpovidat nazvu credential v databazi.

### Krok 4.3 — Nasadit SMTP Proxy
[stejna struktura]

## 5. Supabase Setup (nova instalace)

> Pouze pro roli Admin: Tato sekce je urcena pouze pro uplne novou instalaci.

### Krok 5.1 — Databazove schema
### Krok 5.2 — Migrace

> POZOR: Migraci spoustejte vzdy v poradi.

### Krok 5.3 — Seedovani dat
### Krok 5.4 — Vytvoreni admin uzivatele
### Alternativa — Kompletni setup jednim prikazem

## 6. Prehled promennych prostredi
[Tabulka: Promenna | Pouziva | Popis]

## Slovnicek
[Tabulka: Pojem | Vysvetleni]
```

---

## operations-manual.md

```markdown
# Provozni prirucka

> **Cast 1** je rychly prehled. **Cast 2** obsahuje detailni postupy.

---

## Navigace
| Jsem... | Chci... | Prejdete na... |
|---------|---------|----------------|
[Navigacni tabulka — operator, admin, kdokoliv]

## Referencni tabulka — stavy

### Stavy leadu
[Tabulka: Stav | Barva | Vyznam]

### Stavy vlny
[Tabulka: Stav | Barva | Vyznam]

---

# Cast 1 — Prehled dennich operaci
[Typicky den operatora — 5 bodu]

---

# Cast 2 — Detailni postupy

## 1. Pridani noveho obchodnika / e-mailoveho uctu

### Krok 1.1 — Pridat IMAP credentials
**Cil:** [...]
**Pouze pro roli Admin:** [...]
**Predpoklady:** [...]
**Postup:** [cislovane kroky]
**Vysledek:** [...]

> POZOR: [dulezite upozorneni na presny nazev credential]

### Krok 1.2 — Pridat SMTP credentials
[stejna struktura]

### Krok 1.3 — Pridat obchodnika v UI
### Krok 1.4 — Nastavit outreach ucet

> Caste chyby: [seznam]

## 2. Vytvareni a planovani e-mailovych vln

### Krok 2.1 — Pripravit leady
### Krok 2.2 — Vytvorit vlnu
### Krok 2.3 — Pridat leady do vlny
### Krok 2.4 — Naplanovani vlny
### Krok 2.5 — Sledovani odesilani

> TIP: Sequence timing...

## 3. Sprava sablon
- Sady sablon, editor, promenne
[Tabulka dostupnych promennych: Promenna | Zdroj | Priklad]

> TIP: {{salutation}} uz obsahuje predponu...

## 4. Retarget pool
[Co to je, jak pouzit, postup]

## 5. Sprava uzivatelu
**Pouze pro roli Admin:**
[Tabulka roli: Role | Pristup]
[Postup pridani uzivatele]

## 6. Monitoring

### 6.1 — Detekce odpovedi
### 6.2 — Monitorovani bouncu / NDR
### 6.3 — Denni reset (WF10)
### 6.4 — Health checky
[Tabulka: Sluzba | Endpoint | Overeni z VPS]

### 6.5 — Konfiguracni tabulka
[Tabulka: Klic | Ucel | Priklad]

> TIP: QEV klice se rotuji automaticky...

## 7. Reseni problemu (FAQ)

### E-maily se neodessilaji
[Tabulka: Mozna pricina | Jak overit | Reseni]

### Odpovedi se nedetekuji
[Tabulka: Mozna pricina | Jak overit | Reseni]

### Obohaceni leadu uvaznulo
[Tabulka: Mozna pricina | Jak overit | Reseni]

### Vlna se nedokonci
[Tabulka: Mozna pricina | Jak overit | Reseni]

### Docker kontejnery nefunguji
[Diagnosticky postup s prikazy]

### Problemy s pripojenim k databazi
[Tabulka: Mozna pricina | Jak overit | Reseni]

## Slovnicek
[Tabulka: Pojem | Vysvetleni — vsechny provozni pojmy]
```
