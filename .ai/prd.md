# Dokument wymagań produktu (PRD) - Moje fiszki
## 1. Przegląd produktu
### 1.1 Cel produktu
„Moje fiszki” to responsywna aplikacja webowa do tworzenia, zarządzania i nauki fiszek. Produkt ma skrócić czas potrzebny na przygotowanie materiałów do nauki poprzez połączenie ręcznego tworzenia fiszek z generowaniem kandydatów przez model językowy oraz prostą sesją nauki opartą na gotowej bibliotece open-source do powtórek.

### 1.2 Wizja MVP
MVP ma umożliwić użytkownikowi wykonanie pełnego podstawowego cyklu pracy:
1. założyć i aktywować konto,
2. zalogować się,
3. utworzyć fiszki ręcznie lub wygenerować ich kandydaty przez AI,
4. zarządzać zapisanymi fiszkami,
5. rozpocząć prostą sesję nauki.

### 1.3 Użytkownik docelowy
Produkt jest uniwersalny i nie jest ograniczony do jednej grupy zawodowej, poziomu edukacji ani tematyki. Głównym użytkownikiem jest osoba ucząca się, która chce szybko zamieniać własne materiały źródłowe na fiszki i powtarzać je w jednej aplikacji.

### 1.4 Założenia produktu
1. Interfejs aplikacji jest w języku polskim.
2. Loginem użytkownika jest adres e-mail.
3. System posiada jedną rolę użytkownika.
4. Każdy użytkownik ma własny, prywatny zbiór fiszek.
5. W pierwszej iteracji istnieje logicznie jeden zestaw fiszek na użytkownika, ale jego etykieta nie jest prezentowana w UI.
6. Strona główna po zalogowaniu jest jednocześnie widokiem listy fiszek.
7. Produkt ma spełniać wymagania WCAG 2.2 na poziomie AA.

### 1.5 Główne komponenty MVP
1. Konto użytkownika i bezpieczeństwo dostępu.
2. Lista fiszek z CRUD.
3. Generowanie kandydatów fiszek przez AI.
4. Sesja nauki w modalu.
5. Podstawowe logowanie zdarzeń związanych z generowaniem AI na potrzeby analizy jakości.

## 2. Problem użytkownika
Manualne tworzenie wysokiej jakości fiszek edukacyjnych jest czasochłonne, co obniża motywację do korzystania z nauki opartej o powtórki. Użytkownik potrzebuje prostego narzędzia, które pozwoli mu szybko przejść od materiału źródłowego do gotowych fiszek bez konieczności ręcznego opracowywania każdej karty od zera.

Obecny problem użytkownika składa się z kilku powiązanych trudności:
1. Przygotowanie fiszek ręcznie zajmuje dużo czasu i wymaga wysokiego zaangażowania.
2. Narzędzia do fiszek często rozdzielają etap tworzenia, zarządzania i nauki, przez co proces jest rozproszony.
3. Użytkownik potrzebuje kontroli nad treścią wygenerowaną przez AI i nie chce zapisywać jej automatycznie bez weryfikacji.
4. Użytkownik oczekuje prostego i bezpiecznego dostępu do własnych danych edukacyjnych.
5. Użytkownik potrzebuje minimalnego, ale dopracowanego doświadczenia, które działa dobrze na desktopie i urządzeniach mobilnych.

Produkt odpowiada na te potrzeby przez:
1. generowanie kandydatów fiszek z tekstu wejściowego,
2. możliwość ręcznego dodawania, edycji i usuwania fiszek,
3. zachowanie pełnej kontroli użytkownika nad akceptacją kandydatów AI,
4. przechowywanie prywatnych fiszek przypisanych do konta,
5. umożliwienie natychmiastowego rozpoczęcia nauki po zapisaniu fiszek.

## 3. Wymagania funkcjonalne
### 3.1 Zarządzanie kontem i dostępem
1. System musi umożliwiać rejestrację przy użyciu adresu e-mail, hasła i powtórzenia hasła.
2. Konto musi być aktywowane linkiem wysłanym e-mailem przed pierwszym logowaniem.
3. System musi blokować logowanie kont nieaktywnych.
4. System musi umożliwiać logowanie adresem e-mail i hasłem.
5. System musi umożliwiać reset hasła przez jednorazowy link ważny przez 2 godziny.
6. Wygenerowanie nowego linku resetu musi unieważniać poprzedni link.
7. System musi umożliwiać zmianę hasła z poziomu aplikacji po podaniu aktualnego hasła.
8. Po poprawnej zmianie hasła użytkownik pozostaje zalogowany, a formularz zmiany hasła zostaje zastąpiony komunikatem sukcesu.
9. Hasło musi mieć co najmniej 12 znaków i zawierać małe litery, duże litery, cyfry oraz znaki specjalne.
10. Publicznie dostępne są wyłącznie widoki logowania, rejestracji i resetu hasła.
11. Wszystkie widoki fiszek i nauki muszą być dostępne wyłącznie dla zalogowanego użytkownika.
12. Po wylogowaniu użytkownik musi zostać cicho przekierowany na ekran logowania.
13. Widoki chronione muszą być zabezpieczone także przy użyciu przycisku wstecz w przeglądarce.

### 3.2 Nawigacja, układ i elementy stałe
1. Po zalogowaniu użytkownik trafia na widok listy fiszek, który jest jednocześnie stroną główną aplikacji.
2. Nagłówek widoku prywatnego musi zawierać akcje „Zmień hasło” i „Wyloguj”.
3. Adres e-mail użytkownika nie jest prezentowany w nagłówku.
4. Stopka musi zawierać napis „© {aktualny rok} Moje fiszki”.
5. Aplikacja musi być responsywna.

### 3.3 Lista fiszek
1. Lista fiszek musi prezentować wyłącznie fiszki zalogowanego użytkownika.
2. Jeżeli użytkownik nie ma żadnych fiszek, system musi wyświetlić empty state zachęcający do ręcznego dodania pierwszej fiszki lub wygenerowania ich przez AI.
3. Na widoku listy muszą znajdować się przyciski „Dodaj”, „Generuj przez AI” oraz „Rozpocznij”.
4. Przycisk „Generuj przez AI” musi być silniejszym CTA niż „Dodaj”.
5. Przycisk „Rozpocznij” musi być ukryty, gdy lista fiszek jest pusta.
6. Lista musi być paginowana po 20 elementów na stronę.
7. Lista musi być sortowana malejąco po dacie utworzenia.
8. Każdy element listy musi pokazywać treść przodu fiszki oraz metadane „Utworzono {data}”, jeśli fiszka nie była edytowana.
9. Każdy element listy musi pokazywać metadane „Edytowano: {data}”, jeśli fiszka była edytowana.
10. Format daty i godziny musi mieć postać `DD.MM.YYYY hh:mm` w formacie 24-godzinnym.
11. Treść przodu fiszki na liście musi być wizualnie przycinana zależnie od szerokości kontenera.
12. Każdy element listy musi mieć menu akcji otwierane z poziomu trzech kropek.
13. W danym momencie otwarte może być tylko jedno menu akcji.
14. Kliknięcie poza menu musi je zamykać.

### 3.4 Tworzenie i edycja fiszek ręcznie
1. Dodawanie i edycja fiszki muszą odbywać się w top-level modalu blokującym interakcję z tłem.
2. Dodawanie i edycja muszą wykorzystywać ten sam formularz z innym tytułem zależnie od trybu.
3. Formularz musi zawierać dwa pola wieloliniowe: „przód” i „tył”.
4. Naciśnięcie klawisza Enter musi dodawać nową linię i nie może zapisywać formularza.
5. Pole „przód” może zawierać maksymalnie 200 znaków.
6. Pole „tył” może zawierać maksymalnie 500 znaków.
7. Białe znaki są liczone do limitu znaków.
8. Początkowe białe znaki muszą być usuwane podczas wpisywania.
9. Końcowe białe znaki muszą być usuwane przed zapisem.
10. Oba pola muszą zawierać co najmniej jeden znak niebiały.
11. Fiszki składające się wyłącznie z białych znaków są niedozwolone.
12. Duplikaty treści są dozwolone.
13. Po zapisaniu nowej fiszki modal musi się zamknąć, a lista musi się odświeżyć.
14. Po zapisaniu edycji użytkownik musi pozostać na tej samej stronie listy.

### 3.5 Usuwanie fiszek
1. Usuwanie fiszki musi wymagać potwierdzenia w modalu.
2. Użytkownik musi mieć możliwość anulowania usunięcia.
3. Po usunięciu fiszki użytkownik musi pozostać na tej samej stronie paginacji, chyba że usunięta została ostatnia fiszka na stronie.
4. Jeżeli usunięto ostatnią fiszkę na bieżącej stronie, system musi przenieść użytkownika na poprzednią stronę paginacji.

### 3.6 Generowanie fiszek przez AI
1. Generowanie AI musi być uruchamiane z widoku głównego w osobnym top-level modalu.
2. Modal generowania AI i modal dodawania lub edycji fiszki nie mogą być otwarte jednocześnie.
3. Użytkownik musi móc wkleić tekst wejściowy o długości od 1000 do 10000 znaków.
4. Walidacja długości wsadu musi działać po stronie frontendu i backendu.
5. Modal musi zawierać licznik znaków oraz informację o wymaganej długości wsadu.
6. Po kliknięciu „Generuj” system musi wysłać wsad do backendu i zablokować przycisk do czasu odpowiedzi.
7. Model powinien zwracać kandydatów na fiszki w tym samym języku, co wsad użytkownika.
8. Odpowiedź AI musi zwracać kandydatów jako tymczasową listę, bez automatycznego zapisu do bazy.
9. Każdy kandydat musi posiadać UUID nadane przez backend.
10. Użytkownik musi móc edytować kandydata przed zapisem.
11. Użytkownik musi móc odrzucić pojedynczego kandydata.
12. Użytkownik musi móc zaakceptować całą pozostałą listę kandydatów.
13. Użytkownik musi móc odrzucić całą listę i zamknąć modal bez zapisu.
14. Przy pustej liście kandydatów przycisk akceptacji musi być nieaktywny.
15. Reguły walidacji kandydatów AI muszą być identyczne jak dla fiszek tworzonych ręcznie.
16. Jeśli co najmniej jeden kandydat narusza reguły treści lub limity, akceptacja całej listy musi być zablokowana do czasu poprawy lub odrzucenia niepoprawnych pozycji.
17. Akceptacja listy musi zapisywać wszystkie pozostałe kandydaty atomowo.
18. Po poprawnym zapisie kandydatów modal musi się zamknąć, a użytkownik musi trafić na pierwszą stronę listy przewiniętą do góry.
19. Ponowne kliknięcie „Generuj” musi zastąpić bieżącą listę kandydatów nową listą bez możliwości odzyskania poprzedniej.
20. Zamknięcie modala AI przez przycisk zamknięcia, klawisz ESC lub odświeżenie strony musi bezpowrotnie usuwać niezaakceptowanych kandydatów.
21. Jeżeli odpowiedź modelu nie zawiera kandydatów, modal musi pokazać dedykowany stan „brak propozycji” z opcją ponowienia generowania lub zamknięcia modala.
22. Przy długiej liście kandydatów kluczowe działania muszą pozostać wygodnie dostępne podczas przewijania.

### 3.7 Nauka
1. Nauka musi być dostępna z poziomu listy fiszek przez przycisk „Rozpocznij”.
2. Sesja nauki musi odbywać się w top-level modalu z nagłówkiem „Nauka”.
3. Nowo zapisane fiszki muszą trafiać do mechanizmu powtórek jako nowe.
4. W pierwszym widoku fiszki w lekcji widoczny jest wyłącznie przód karty.
5. Kliknięcie karty musi ujawniać tył.
6. Ponowne kliknięcie odwróconej karty musi przywracać widok przodu.
7. W lekcji musi być widoczna paginacja odpowiadająca kolejności fiszek w kolekcji.
8. Po odwróceniu karty musi pojawić się po prawej stronie przycisk przejścia do kolejnej fiszki.
9. Użytkownik musi mieć możliwość cofania się w obrębie sesji nauki.
10. W lekcji musi być prezentowana pełna treść przodu i tyłu fiszki.
11. Po ostatniej interakcji użytkownik musi zobaczyć ekran zakończenia w tym samym modalu.
12. Ekran zakończenia musi umożliwiać zamknięcie modala przez przycisk „Zamknij” oraz przez ikonę zamknięcia.
13. Po zakończeniu lub zamknięciu lekcji lista fiszek musi zostać odświeżona.
14. Po zamknięciu lekcji fokus musi wrócić na przycisk „Rozpocznij”.

### 3.8 Logi i retencja danych związanych z AI
1. System musi zapisywać log generowania AI do dedykowanej tabeli.
2. Log musi zawierać pełną listę pierwotnie wygenerowanych kandydatów oraz dane potrzebne do późniejszej analizy jakości.
3. Prompty do modelu muszą być przechowywane przez 30 dni wyłącznie w celu wykrywania nadużyć.
4. Prompty nie mogą być wykorzystywane do dalszego uczenia modelu.
5. Po usunięciu konta fiszki i logi generowania muszą zostać usunięte natychmiast.
6. Po usunięciu konta prompty mogą pozostać przez 30 dni zgodnie z zasadą retencji.

### 3.9 Wymagania niefunkcjonalne i jakościowe
1. Interfejs musi być spójny językowo i używać nazwy produktu „Moje fiszki”.
2. Wszystkie główne ścieżki użytkownika muszą działać bez użycia natywnych okien przeglądarki do potwierdzeń.
3. Modale muszą blokować interakcję z tłem.
4. Aplikacja musi być zgodna z WCAG 2.2 AA.
5. Dokument nie definiuje szczegółów technicznych biblioteki powtórek ani implementacji infrastrukturalnej poza wymaganym zachowaniem produktu.

## 4. Granice produktu
### 4.1 Zakres MVP
W zakres MVP wchodzą:
1. rejestracja, aktywacja konta, logowanie, reset hasła i zmiana hasła,
2. prywatny dostęp do własnych fiszek,
3. lista fiszek z empty state, paginacją, metadanymi i menu akcji,
4. ręczne dodawanie, edycja i usuwanie fiszek,
5. generowanie kandydatów na fiszki przez AI z edycją, odrzucaniem i akceptacją,
6. prosta sesja nauki oparta o gotową bibliotekę open-source,
7. logowanie generowań AI na potrzeby analizy jakości.

### 4.2 Poza zakresem MVP
Poza zakresem MVP pozostają:
1. własny, zaawansowany algorytm powtórek podobny do SuperMemo lub Anki,
2. import wielu formatów plików, takich jak PDF czy DOCX,
3. współdzielenie zestawów fiszek między użytkownikami,
4. integracje z innymi platformami edukacyjnymi,
5. aplikacje mobilne natywne,
6. rozbudowany onboarding,
7. dodatkowe limity użycia AI,
8. dodatkowa analityka produktowa poza analizą tabeli logów AI,
9. moderacja wsadu użytkownika wykraczająca poza podstawową walidację długości,
10. regulamin, polityka prywatności i proces wsparcia użytkownika,
11. szczegółowe decyzje techniczne dotyczące biblioteki do powtórek i implementacji infrastruktury.

### 4.3 Otwarte kwestie nieblokujące redakcji PRD
1. Konkretna biblioteka open-source do obsługi powtórek zostanie wybrana później.
2. Szczegóły technicznej implementacji logów i integracji z biblioteką powtórek są poza zakresem tego PRD.
3. Orientacyjne cele 75% nie mają w MVP osobnego planu badawczego ani szczegółowej metodologii pomiaru.
4. Zakres informacji prezentowanych na ekranie zakończenia nauki nie został doprecyzowany poza samym istnieniem tego ekranu.
5. Ostrzeżenie przed nadpisaniem istniejącej listy kandydatów przy ponownym generowaniu nie jest wymaganiem obowiązkowym na poziomie MVP.

## 5. Historyjki użytkowników
### US-001
- ID: US-001
- Tytuł: Rejestracja nowego konta
- Opis: Jako nowy użytkownik chcę założyć konto przy użyciu adresu e-mail i hasła, abym mógł bezpiecznie przechowywać własne fiszki.
- Kryteria akceptacji:
1. Formularz rejestracji zawiera pola e-mail, hasło i powtórzenie hasła.
2. System odrzuca formularz, jeśli hasło i powtórzenie hasła różnią się.
3. System odrzuca formularz, jeśli hasło nie spełnia reguł złożoności.
4. Po poprawnym wysłaniu formularza konto zostaje utworzone w stanie nieaktywnym.
5. Po poprawnej rejestracji system inicjuje wysłanie linku aktywacyjnego na podany adres e-mail.

### US-002
- ID: US-002
- Tytuł: Aktywacja konta e-mailem
- Opis: Jako nowo zarejestrowany użytkownik chcę aktywować konto przez link e-mail, abym mógł się zalogować.
- Kryteria akceptacji:
1. Konto nieaktywne nie może zostać użyte do logowania.
2. Wejście w poprawny link aktywacyjny aktywuje konto.
3. Po aktywacji użytkownik może przejść do logowania.
4. Bez aktywacji konto pozostaje zablokowane dla dostępu do części prywatnej.

### US-003
- ID: US-003
- Tytuł: Logowanie do aplikacji
- Opis: Jako użytkownik chcę zalogować się adresem e-mail i hasłem, abym mógł uzyskać dostęp do własnych fiszek.
- Kryteria akceptacji:
1. Formularz logowania przyjmuje e-mail i hasło.
2. Poprawne dane aktywnego konta przenoszą użytkownika do widoku listy fiszek.
3. Próba logowania na konto nieaktywne jest blokowana.
4. Publicznie dostępne pozostają wyłącznie ekrany logowania, rejestracji i resetu hasła.

### US-004
- ID: US-004
- Tytuł: Reset hasła przez e-mail
- Opis: Jako użytkownik chcę zresetować hasło przez link wysłany e-mailem, abym mógł odzyskać dostęp do konta.
- Kryteria akceptacji:
1. Ekran resetu hasła jest dostępny publicznie.
2. System wysyła jednorazowy link resetu na adres e-mail użytkownika.
3. Link resetu jest ważny przez 2 godziny.
4. Wygenerowanie nowego linku unieważnia poprzedni link.
5. Nowe hasło po resecie musi spełniać reguły złożoności hasła.

### US-005
- ID: US-005
- Tytuł: Zmiana hasła po zalogowaniu
- Opis: Jako zalogowany użytkownik chcę zmienić hasło z poziomu aplikacji, abym mógł utrzymać bezpieczeństwo konta bez wylogowywania się.
- Kryteria akceptacji:
1. Akcja „Zmień hasło” jest dostępna w nagłówku części prywatnej.
2. Zmiana hasła odbywa się w modalu.
3. Formularz wymaga podania aktualnego hasła.
4. Nowe hasło musi spełniać reguły złożoności.
5. Po poprawnej zmianie hasła użytkownik pozostaje zalogowany.
6. Po sukcesie formularz jest zastępowany komunikatem potwierdzającym zmianę.

### US-006
- ID: US-006
- Tytuł: Bezpieczny dostęp do części prywatnej
- Opis: Jako użytkownik chcę mieć pewność, że tylko zalogowane osoby mają dostęp do moich fiszek, abym mógł bezpiecznie korzystać z aplikacji.
- Kryteria akceptacji:
1. Widoki listy fiszek, CRUD i nauki są dostępne wyłącznie dla zalogowanego użytkownika.
2. Każdy użytkownik widzi wyłącznie własne fiszki.
3. Po wylogowaniu następuje ciche przekierowanie do ekranu logowania.
4. Po wylogowaniu użycie przycisku wstecz nie przywraca dostępu do chronionych ekranów.

### US-007
- ID: US-007
- Tytuł: Widok listy fiszek i empty state
- Opis: Jako zalogowany użytkownik chcę zobaczyć główny widok aplikacji z listą fiszek lub stanem pustym, abym wiedział, co mogę zrobić dalej.
- Kryteria akceptacji:
1. Po zalogowaniu użytkownik trafia na widok listy fiszek.
2. Jeśli użytkownik nie ma fiszek, widzi empty state z zachętą do dodania fiszki ręcznie lub wygenerowania przez AI.
3. W widoku listy są dostępne przyciski „Dodaj” i „Generuj przez AI”.
4. Przycisk „Generuj przez AI” jest wizualnie silniejszym CTA.
5. Przycisk „Rozpocznij” nie jest widoczny, gdy lista fiszek jest pusta.

### US-008
- ID: US-008
- Tytuł: Przeglądanie paginowanej listy fiszek
- Opis: Jako użytkownik chcę przeglądać zapisane fiszki na uporządkowanej liście, abym mógł szybko znaleźć i wykorzystać swoje materiały.
- Kryteria akceptacji:
1. Lista pokazuje maksymalnie 20 fiszek na stronę.
2. Fiszki są sortowane malejąco po dacie utworzenia.
3. Każdy element pokazuje treść przodu oraz metadane „Utworzono” lub „Edytowano”.
4. Data i godzina są prezentowane w formacie `DD.MM.YYYY hh:mm`.
5. Treść przodu jest wizualnie przycinana zgodnie z szerokością kontenera.

### US-009
- ID: US-009
- Tytuł: Korzystanie z menu akcji fiszki
- Opis: Jako użytkownik chcę otworzyć menu akcji dla konkretnej fiszki, abym mógł ją edytować lub usunąć.
- Kryteria akceptacji:
1. Każda fiszka na liście posiada menu trzech kropek.
2. W menu dostępne są akcje „Edytuj” i „Usuń”.
3. W danym momencie otwarte może być tylko jedno menu.
4. Kliknięcie poza menu zamyka otwarte menu.

### US-010
- ID: US-010
- Tytuł: Ręczne dodanie nowej fiszki
- Opis: Jako użytkownik chcę ręcznie dodać nową fiszkę, abym mógł tworzyć własne materiały bez użycia AI.
- Kryteria akceptacji:
1. Kliknięcie „Dodaj” otwiera modal z polami „przód” i „tył”.
2. Oba pola są wieloliniowe.
3. Klawisz Enter dodaje nową linię i nie zapisuje formularza.
4. „Przód” akceptuje do 200 znaków, a „tył” do 500 znaków.
5. Początkowe białe znaki są usuwane podczas wpisywania.
6. Końcowe białe znaki są usuwane przed zapisem.
7. Oba pola muszą zawierać co najmniej jeden znak niebiały.
8. Po poprawnym zapisie modal się zamyka, a lista odświeża się.
9. Duplikat treści może zostać zapisany.

### US-011
- ID: US-011
- Tytuł: Edycja istniejącej fiszki
- Opis: Jako użytkownik chcę edytować wcześniej zapisaną fiszkę, abym mógł poprawiać lub aktualizować jej treść.
- Kryteria akceptacji:
1. Akcja „Edytuj” otwiera ten sam modal formularza co przy dodawaniu, z innym tytułem.
2. Formularz jest wypełniony aktualnymi danymi fiszki.
3. Obowiązują te same limity, walidacje i reguły sanityzacji co przy dodawaniu.
4. Po poprawnym zapisie użytkownik pozostaje na tej samej stronie listy.
5. Na liście po edycji widoczne są metadane „Edytowano: {data}”.

### US-012
- ID: US-012
- Tytuł: Usunięcie fiszki z potwierdzeniem
- Opis: Jako użytkownik chcę usunąć wybraną fiszkę po potwierdzeniu, abym mógł utrzymywać porządek na liście.
- Kryteria akceptacji:
1. Akcja „Usuń” otwiera modal potwierdzenia.
2. Użytkownik może anulować usunięcie bez zmian na liście.
3. Po potwierdzeniu fiszka znika z listy.
4. Użytkownik pozostaje na tej samej stronie paginacji, jeśli po usunięciu na stronie zostały jeszcze inne fiszki.
5. Jeśli usunięto ostatnią fiszkę z bieżącej strony, system przenosi użytkownika na poprzednią stronę.

### US-013
- ID: US-013
- Tytuł: Otwarcie modalu generowania AI i wprowadzenie wsadu
- Opis: Jako użytkownik chcę wkleić materiał źródłowy do modalu AI, abym mógł wygenerować kandydatów na fiszki.
- Kryteria akceptacji:
1. Kliknięcie „Generuj przez AI” otwiera top-level modal.
2. W tym samym czasie nie może być otwarty modal dodawania lub edycji fiszki.
3. Modal zawiera pole tekstowe na wsad, licznik znaków i informację o wymaganej długości.
4. System blokuje generowanie, jeśli wsad ma mniej niż 1000 znaków lub więcej niż 10000 znaków.
5. Ta sama walidacja długości obowiązuje po stronie backendu.

### US-014
- ID: US-014
- Tytuł: Wygenerowanie kandydatów na fiszki przez AI
- Opis: Jako użytkownik chcę wygenerować listę kandydatów na fiszki z mojego tekstu, abym mógł szybciej przygotować materiał do nauki.
- Kryteria akceptacji:
1. Kliknięcie „Generuj” wysyła wsad do backendu.
2. Przycisk „Generuj” jest zablokowany do czasu uzyskania odpowiedzi.
3. Odpowiedź zwraca tymczasową listę kandydatów, która nie zapisuje się automatycznie do bazy.
4. Każdy kandydat posiada UUID zwracane przez backend.
5. Kandydaci są prezentowani w języku zgodnym z językiem wsadu użytkownika.

### US-015
- ID: US-015
- Tytuł: Obsługa braku propozycji AI
- Opis: Jako użytkownik chcę otrzymać jasny komunikat, gdy model nie wygeneruje żadnych kandydatów, abym wiedział, co mogę zrobić dalej.
- Kryteria akceptacji:
1. Jeśli odpowiedź modelu nie zawiera kandydatów, modal pokazuje stan „brak propozycji”.
2. W stanie „brak propozycji” użytkownik może ponowić generowanie.
3. W stanie „brak propozycji” użytkownik może zamknąć modal bez zapisu.

### US-016
- ID: US-016
- Tytuł: Edycja i odrzucanie kandydatów AI
- Opis: Jako użytkownik chcę poprawiać lub odrzucać pojedyncze kandydaty AI, abym mógł zachować kontrolę nad jakością zapisywanych fiszek.
- Kryteria akceptacji:
1. Użytkownik może edytować treść każdego kandydata AI przed zapisem.
2. Użytkownik może odrzucić pojedynczego kandydata.
3. Dla kandydatów AI obowiązują te same limity i reguły walidacji co dla fiszek ręcznych.
4. Jeśli kandydat narusza reguły walidacji, system blokuje akceptację całej listy do czasu poprawy lub odrzucenia niepoprawnej pozycji.
5. Jeśli użytkownik odrzuci wszystkie kandydaty, przycisk akceptacji staje się nieaktywny.

### US-017
- ID: US-017
- Tytuł: Akceptacja wygenerowanych kandydatów AI
- Opis: Jako użytkownik chcę zaakceptować poprawną listę kandydatów AI, abym mógł zapisać je jako własne fiszki.
- Kryteria akceptacji:
1. Akceptacja zapisuje wszystkie pozostałe kandydaty atomowo.
2. Klient odsyła do backendu UUID zaakceptowanych kandydatów.
3. Po poprawnym zapisie modal AI zamyka się.
4. Po zapisie użytkownik trafia na pierwszą stronę listy fiszek.
5. Lista po zapisie jest odświeżona i przewinięta do góry.

### US-018
- ID: US-018
- Tytuł: Odrzucenie całości i utrata tymczasowych kandydatów AI
- Opis: Jako użytkownik chcę świadomie zamknąć lub odrzucić listę kandydatów AI, wiedząc że nie zostaną zapisani, abym mógł kontrolować swój roboczy wynik.
- Kryteria akceptacji:
1. Użytkownik może odrzucić całą listę i zamknąć modal bez zapisu.
2. Ponowne kliknięcie „Generuj” zastępuje bieżącą listę nową listą bez możliwości odzyskania poprzedniej.
3. Zamknięcie modala AI przez ikonę zamknięcia usuwa niezaakceptowanych kandydatów.
4. Zamknięcie modala AI przez klawisz ESC usuwa niezaakceptowanych kandydatów.
5. Odświeżenie strony podczas otwartego modala AI usuwa niezaakceptowanych kandydatów.

### US-019
- ID: US-019
- Tytuł: Rozpoczęcie sesji nauki
- Opis: Jako użytkownik chcę uruchomić sesję nauki z poziomu listy fiszek, abym mógł od razu przejść do powtórek.
- Kryteria akceptacji:
1. Przycisk „Rozpocznij” jest dostępny tylko wtedy, gdy użytkownik ma co najmniej jedną fiszkę.
2. Kliknięcie „Rozpocznij” otwiera modal z nagłówkiem „Nauka”.
3. Do sesji trafiają zapisane fiszki użytkownika, w tym nowo utworzone jako nowe w mechanizmie powtórek.

### US-020
- ID: US-020
- Tytuł: Przechodzenie przez fiszki w sesji nauki
- Opis: Jako użytkownik chcę przeglądać fiszki w sesji nauki, odwracać je i przechodzić dalej lub wracać, abym mógł realizować podstawowy proces powtórek.
- Kryteria akceptacji:
1. Pierwszy widok karty pokazuje wyłącznie przód fiszki.
2. Kliknięcie karty ujawnia tył fiszki.
3. Ponowne kliknięcie odwróconej karty przywraca widok przodu.
4. W lekcji prezentowana jest pełna treść przodu i tyłu.
5. Pod kartą widoczna jest paginacja odpowiadająca kolejności fiszek.
6. Po odwróceniu karty pojawia się po prawej stronie przycisk przejścia do kolejnej fiszki.
7. Użytkownik może cofać się w obrębie lekcji.

### US-021
- ID: US-021
- Tytuł: Zakończenie sesji nauki i powrót do listy
- Opis: Jako użytkownik chcę poprawnie zakończyć sesję nauki i wrócić do listy, abym mógł kontynuować pracę w aplikacji.
- Kryteria akceptacji:
1. Po ostatniej interakcji system pokazuje ekran zakończenia w tym samym modalu.
2. Ekran zakończenia umożliwia zamknięcie modala przyciskiem „Zamknij”.
3. Modal nauki można zamknąć także ikoną zamknięcia.
4. Po zamknięciu lub zakończeniu sesji lista fiszek zostaje odświeżona.
5. Po powrocie fokus trafia na przycisk „Rozpocznij”.

### US-022
- ID: US-022
- Tytuł: Korzystanie z aplikacji w sposób dostępny i responsywny
- Opis: Jako użytkownik chcę korzystać z aplikacji na różnych urządzeniach i z użyciem technologii wspierających, abym mógł wygodnie i samodzielnie obsłużyć wszystkie główne funkcje.
- Kryteria akceptacji:
1. Aplikacja pozostaje używalna na typowych szerokościach mobilnych i desktopowych.
2. Modale blokują interakcję z tłem i stanowią wyraźnie odseparowany kontekst pracy.
3. Główne ścieżki: logowanie, CRUD fiszek, generowanie AI i nauka są projektowane zgodnie z WCAG 2.2 AA.
4. Po zamknięciu sesji nauki fokus wraca na logiczny element wywołujący.

## 6. Metryki sukcesu
### 6.1 Główne metryki biznesowe dla pilotażu
1. Co najmniej 75% fiszek wygenerowanych przez AI jest akceptowanych przez użytkowników.
2. Co najmniej 75% wszystkich tworzonych fiszek powstaje z wykorzystaniem AI.

### 6.2 Sposób pomiaru
1. Pomiar skuteczności AI opiera się na dedykowanej tabeli logów generowania.
2. Logi muszą zawierać pełną listę pierwotnie wygenerowanych kandydatów, identyfikatory kart oraz dane potrzebne do analizy jakości promptów i wyników.
3. Akceptacja kandydatów AI jest mierzona przez porównanie listy wygenerowanej z listą finalnie zapisaną.
4. Udział fiszek tworzonych z AI jest mierzony jako udział fiszek zapisanych po akceptacji kandydatów AI względem wszystkich nowo zapisanych fiszek.

### 6.3 Interpretacja metryk
1. Metryki 75% mają charakter orientacyjnych celów pilotażowych, a nie warunku odbioru MVP.
2. Brak osobnego systemu analitycznego jest świadomą decyzją produktową na etapie MVP.
3. Ocena skuteczności produktu ma bazować przede wszystkim na działających ścieżkach użytkownika oraz danych z logów AI.

### 6.4 Kryteria gotowości produktu do dalszego etapu
Produkt można uznać za gotowy do dalszych prac po spełnieniu poniższych warunków:
1. wszystkie historyjki użytkownika opisane w tym PRD są implementowalne i testowalne,
2. wszystkie kryteria akceptacji są jednoznaczne i możliwe do weryfikacji,
3. komplet ścieżek obejmuje uwierzytelnianie, autoryzację, CRUD fiszek, generowanie AI i sesję nauki
