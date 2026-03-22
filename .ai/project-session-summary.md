<conversation_summary>
<decisions>
1. Produkt MVP to webowa, responsywna aplikacja „Moje fiszki”, której celem jest ułatwienie generowania fiszek przez LLM, ręcznego tworzenia fiszek, zarządzania nimi oraz nauki z użyciem gotowego algorytmu powtórek.
2. Aplikacja ma być uniwersalna, bez zawężania do konkretnej grupy docelowej lub tematyki nauki.
3. Zakres MVP obejmuje: rejestrację i logowanie użytkownika, aktywację konta e-mailem, reset hasła, zmianę hasła, CRUD fiszek, generowanie fiszek przez AI oraz sesję nauki z integracją z gotową biblioteką open-source do powtórek.
4. Poza zakresem MVP pozostają: własny zaawansowany algorytm powtórek, import wielu formatów, współdzielenie zestawów, integracje z innymi platformami oraz aplikacje mobilne.
5. Loginem użytkownika jest adres e-mail. W systemie występuje tylko jedna rola użytkownika.
6. Rejestracja wymaga e-maila, hasła i powtórzenia hasła. Konto aktywowane jest linkiem e-mailowym. Przed aktywacją użytkownik nie może się zalogować.
7. Reset hasła odbywa się przez jednorazowy link wysyłany e-mailem, ważny 2 godziny. Wygenerowanie nowego linku unieważnia poprzedni.
8. Zmiana hasła odbywa się w modalu i wymaga podania aktualnego hasła. Po poprawnej zmianie użytkownik pozostaje zalogowany, a formularz jest zastępowany komunikatem o sukcesie.
9. Hasło musi mieć co najmniej 12 znaków i zawierać małe oraz duże litery, cyfry i znaki specjalne.
10. UI aplikacji jest w języku polskim, a kandydaci na fiszki generowani przez model mają być w tym samym języku co wsad użytkownika.
11. Strona główna i widok listy fiszek to ten sam ekran. W pierwszym etapie aplikacja pokazuje tylko listę fiszek, bez widoku kolekcji.
12. W nagłówku znajdują się akcje: wylogowanie i zmiana hasła. E-mail użytkownika nie jest wyświetlany.
13. W stopce ma znaleźć się napis „© {rok} Moje fiszki”, gdzie rok jest aktualny.
14. Publicznie dostępne są tylko ekrany logowania, rejestracji i resetu hasła. Podgląd i modyfikacja fiszek są dostępne wyłącznie dla zalogowanego użytkownika.
15. Po wylogowaniu użytkownik jest cicho przekierowywany na ekran logowania, a widoki chronione mają być dodatkowo zabezpieczone przed dostępem także przy użyciu przycisku „wstecz”.
16. Każdy użytkownik ma własny zestaw fiszek. W pierwszej iteracji istnieje logicznie jeden zestaw, ale jego etykieta nie jest widoczna w UI.
17. Jeśli użytkownik nie ma żadnych fiszek, zamiast listy widzi komunikat zachęcający do dodania pierwszych fiszek ręcznie lub wygenerowania ich przez AI.
18. Na widoku listy dostępne są przyciski „Dodaj”, generowanie przez AI oraz „Rozpocznij”. Przycisk generowania przez AI ma być silniejszym CTA. Przycisk „Rozpocznij” jest ukryty, gdy lista jest pusta.
19. Lista fiszek jest paginowana: maksymalnie 20 elementów na stronę, bez filtrowania, z sortowaniem malejącym po dacie utworzenia.
20. Na liście każda fiszka pokazuje treść przodu oraz metadane: „Utworzono {data}” albo „Edytowano: {data}”, jeśli fiszka była kiedykolwiek edytowana.
21. Data i godzina mają format `DD.MM.YYYY hh:mm` w zapisie 24-godzinnym.
22. Treść przodu na liście jest wizualnie przycinana zależnie od szerokości kontenera.
23. Każda fiszka na liście ma menu trzech kropek z akcjami „Edytuj” i „Usuń”. Jednocześnie może być otwarte tylko jedno menu, a kliknięcie poza nim je zamyka.
24. Usuwanie fiszki wymaga potwierdzenia w modalu. Użytkownik może anulować usunięcie. Po usunięciu pozostaje na tej samej stronie paginacji, chyba że usunięto ostatnią fiszkę na stronie, wtedy następuje powrót na stronę poprzednią.
25. Dodawanie nowej fiszki odbywa się w modalu z polami „przód” i „tył”. Po zapisie modal się zamyka, a lista odświeża.
26. Edycja zapisanej fiszki odbywa się w tym samym modalu co dodawanie, ale z innym tytułem. Po zapisie użytkownik pozostaje na tej samej stronie listy.
27. Pola „przód” i „tył” są wieloliniowe. Naciśnięcie Enter dodaje nową linię i nie zapisuje formularza.
28. Limity treści fiszki wynoszą: do 200 znaków dla pola „przód” i do 500 znaków dla pola „tył”.
29. Białe znaki są liczone do długości pola, ale początkowe białe znaki mają być usuwane podczas wpisywania, a końcowe przed zapisem.
30. Fiszka musi zawierać co najmniej jeden znak niebiały zarówno w polu „przód”, jak i „tył”. Karty składające się tylko z białych znaków są niedozwolone.
31. Te same reguły walidacji, limitów i sanityzacji obowiązują fiszki dodawane ręcznie, edytowane i zaakceptowane z AI.
32. Dopuszczalne są duplikaty treści fiszek; system nie wymusza unikalności.
33. Generowanie AI odbywa się w modalu uruchamianym z widoku głównego. Użytkownik wprowadza tekst wsadowy, klika „Generuj”, a pod polem pojawia się lista kandydatów na fiszki.
34. Kandydaci z LLM nie są zapisywani do bazy automatycznie. Są prezentowani jako tymczasowa lista, którą można edytować, odrzucać pojedynczo lub zaakceptować w całości.
35. Każda wygenerowana fiszka otrzymuje UUID zwracane przez backend wraz z odpowiedzią LLM. UUID jest odsyłane przez klienta przy akceptacji.
36. Przyjęto ryzyko potencjalnej manipulacji UUID i nie rozwijano tego tematu dalej w wymaganiach.
37. Akceptacja listy zapisuje wszystkie pozostałe kandydaty do bazy atomowo i zamyka modal. Odrzucenie całości zamyka modal bez zapisu.
38. Użytkownik może odrzucić pojedyncze kandydaty. Pustej listy nie da się zapisać, a przycisk akceptacji jest wtedy nieaktywny.
39. Jeśli model zwróci kartę naruszającą limity lub reguły treści, akceptacja całej listy jest blokowana do czasu poprawy lub odrzucenia niepoprawnych fiszek.
40. Ponowne kliknięcie „Generuj” usuwa aktualną listę kandydatów i zastępuje ją nową. Utraconych kandydatów nie można odzyskać.
41. Zamknięcie modala generowania przez ESC, X lub odświeżenie strony powoduje bezpowrotną utratę kandydatów.
42. Długość wsadu do LLM wynosi od 1000 do 10000 znaków. Walidacja działa po stronie frontendu i backendu.
43. W modalu generowania mają znaleźć się licznik znaków oraz label informujący o wymaganej długości wsadu.
44. Przycisk „Generuj” jest blokowany do czasu odpowiedzi serwera.
45. Jeśli odpowiedź modelu nie zawiera kandydatów, użytkownik widzi dedykowany stan „brak propozycji” i może ponowić generowanie lub zamknąć modal.
46. W modalu generowania przy długiej liście kandydatów działania mają pozostać wygodnie dostępne, również podczas przewijania.
47. Aplikacja ma używać modali top-level, blokujących możliwość interakcji z tłem. Modal generowania i modal dodawania/edycji nie mogą być otwarte jednocześnie.
48. Do analizy jakości AI ma służyć dedykowana tabela logów generowania. Logi zawierają pełną listę pierwotnie wygenerowanych fiszek oraz dodatkowe informacje potrzebne do analizy.
49. Prompty do modelu są przechowywane przez 30 dni wyłącznie w celu wykrywania nadużyć i nie są wykorzystywane do dalszego uczenia modelu.
50. Po usunięciu konta prompty pozostają przez 30 dni, natomiast fiszki i logi generowania są usuwane natychmiast.
51. Nie przewidziano dodatkowych limitów użycia AI ani dodatkowej analityki poza analizą tabeli logów.
52. Do nauki wykorzystywana będzie gotowa biblioteka open-source, której wybór zostanie określony później.
53. Nowo zapisane fiszki trafiają do mechanizmu powtórek jako nowe.
54. Lekcja odbywa się w modalu z nagłówkiem „Nauka”.
55. Pierwszy widok karty pokazuje wyłącznie przód. Ujawnienie tyłu wymaga kliknięcia w kartę. Ponowne kliknięcie odwróconej karty przywraca przód.
56. Pod kartą znajduje się paginacja odpowiadająca kolejności fiszek w kolekcji. Po odwróceniu karty pojawia się po prawej przycisk „>” do przejścia do kolejnej fiszki.
57. Użytkownik może cofać się w obrębie lekcji.
58. W lekcji prezentowana jest pełna treść przodu i tyłu fiszki.
59. Po ostatniej interakcji użytkownik widzi ekran zakończenia w tym samym modalu. Modal można zamknąć przyciskiem X lub przyciskiem „Zamknij” na dole.
60. Po zakończeniu lub zamknięciu lekcji lista fiszek ma zostać odświeżona, a fokus powinien wrócić na przycisk „Rozpocznij”.
61. Aplikacja ma być zgodna z WCAG 2.2 na poziomie AA.
62. Nie przewidziano regulaminu, polityki prywatności ani wsparcia użytkownika w obecnym zakresie MVP.
63. Cele sukcesu 75% pozostają orientacyjne i mają być oceniane dopiero w pilotażu, nie jako część szczegółowego planu pomiaru w PRD.
</decisions>

<matched_recommendations>
1. Doprecyzowanie przepływu „tekst → generowanie → edycja → akceptacja/odrzucenie → zapis” zostało w pełni zaadresowane i stanowi jedną z głównych osi PRD.
2. Zalecenie, aby jasno zdefiniować znaczenie „akceptacji fiszki”, zostało uwzględnione: kandydaci nie trafiają do bazy przed akceptacją, a metryki mają opierać się na logach generowania i zapisie zaakceptowanych kart.
3. Rekomendacja dotycząca jednej, spójnej definicji logowania i identyfikatora konta została zastosowana: loginem jest e-mail użytkownika.
4. Rekomendacja, aby ograniczyć model kont do minimalnego wariantu MVP, została przyjęta: tylko jedna rola użytkownika, prosty model dostępu.
5. Zalecenie dotyczące jednoznacznego zdefiniowania stanów UI modali zostało odzwierciedlone w rozmowie: blokowanie tła, utrata kandydatów po zamknięciu, wzajemne wykluczanie modali, stany końca lekcji i brak propozycji AI.
6. Rekomendacja, aby doprecyzować reguły walidacji treści fiszek, została wdrożona szczegółowo: limity znaków, wymóg co najmniej jednego znaku niebiałego, zasady normalizacji białych znaków i spójność między trybem ręcznym a AI.
7. Zalecenie, by zdefiniować metadane oraz sposób prezentacji listy, zostało uwzględnione: sortowanie po dacie utworzenia, paginacja, etykiety „Utworzono” i „Edytowano”, format daty, skracanie treści przez CSS.
8. Rekomendacja, aby z góry ustalić wzorzec dodawania i edycji, została przyjęta: jeden modal dla obu przypadków, z różnym tytułem.
9. Zalecenie dotyczące jednoznacznych reguł po mutacjach listy zostało wdrożone: zachowanie strony po edycji/usunięciu, przejście na stronę 1 po akceptacji AI, odświeżenia listy po działaniach.
10. Rekomendacja dotycząca polityki usuwania i potwierdzeń została zrealizowana: spójne modale potwierdzające, brak natywnych okien przeglądarki.
11. Zalecenie dotyczące obsługi pustych stanów zostało odzwierciedlone zarówno dla listy fiszek, jak i dla generowania AI bez wyników.
12. Rekomendacja, aby zdefiniować hierarchię CTA i onboarding bez pełnego tutoriala, została częściowo zastosowana: AI jest silniejszym CTA, ale formalnego onboardingu nie przewidziano.
13. Zalecenie, aby zdefiniować minimalne zasady bezpieczeństwa i zachowania formularzy konta, zostało uwzględnione: reguły haseł, aktywacja, reset, czyszczenie pól po błędach i ujednolicone komunikaty logowania.
14. Rekomendacja, aby określić responsywność i zgodność dostępności, została przyjęta: aplikacja ma być responsywna i zgodna z WCAG 2.2 AA.
15. Zalecenie, aby ujednolicić nazewnictwo produktu i nagłówków, zostało wdrożone: nazwa „Moje fiszki” jest spójna w brandingowych elementach aplikacji.
16. Rekomendacja, by zdefiniować zachowanie po wylogowaniu i ochronę tras, została zaadresowana: ciche przekierowanie do logowania oraz dodatkowe zabezpieczenie przed dostępem do widoków chronionych.
17. Zalecenie, aby sprecyzować podstawowy przebieg lekcji, zostało szeroko zaadresowane: odwracanie karty, przechodzenie dalej, cofanie, ekran zakończenia, odświeżenie listy i powrót fokusu.
18. Rekomendacja, aby oddzielić cele pilotażowe od Definition of Done, została przyjęta: cele 75% są orientacyjne, a DoD obejmuje działające ścieżki funkcjonalne.
19. Rekomendacja, aby nie rozbudowywać PRD o nieustalone szczegóły techniczne integracji SRS, została zachowana: wybór biblioteki open-source pozostawiono na później.
20. Rekomendacja, aby oprzeć pomiar skuteczności AI na własnych logach zamiast pełnej analityce produktowej, została przyjęta wprost.
</matched_recommendations>

<prd_planning_summary>
### Główne wymagania funkcjonalne produktu
MVP obejmuje kompletny podstawowy zestaw funkcji potrzebnych do korzystania z aplikacji do fiszek: konto użytkownika, zarządzanie hasłem, CRUD fiszek, generowanie kandydatów na fiszki przez LLM oraz prostą lekcję opartą o gotowy mechanizm powtórek. Użytkownik może założyć konto, aktywować je przez e-mail, zalogować się, zresetować hasło i zmienić hasło z poziomu aplikacji. Wszystkie fiszki są prywatne i przypisane do konkretnego użytkownika.

Rdzeniem produktu jest widok listy fiszek, będący jednocześnie stroną główną po zalogowaniu. Z tego widoku użytkownik może ręcznie dodawać fiszki, edytować istniejące, usuwać je oraz rozpocząć naukę. Lista jest paginowana, sortowana malejąco po dacie utworzenia i zawiera podstawowe metadane. Każda karta listy posiada proste menu akcji z możliwością edycji lub usunięcia.

Generowanie przez AI realizowane jest w osobnym modalu. Użytkownik wkleja tekst o długości od 1000 do 10000 znaków, po czym system zwraca listę tymczasowych kandydatów na fiszki. Kandydaci nie są zapisywani automatycznie do bazy. Użytkownik może je przeglądać, edytować, odrzucać pojedynczo lub zaakceptować całą poprawną listę. Zapis następuje dopiero po akceptacji. Lista kandydatów ma charakter ulotny i jest tracona po zamknięciu modala lub ponownym generowaniu.

Lekcja odbywa się w dedykowanym modalu „Nauka”. Każda karta pokazuje najpierw przód, a ujawnienie tyłu wymaga kliknięcia. Użytkownik może przechodzić dalej, cofać się, obserwować postęp i zakończyć lekcję. Po zakończeniu sesji widok listy ma zostać odświeżony.

### Kluczowe historie użytkownika i ścieżki korzystania
Najważniejsza ścieżka użytkownika zaczyna się od rejestracji, aktywacji konta i logowania, po czym użytkownik trafia na listę fiszek. Jeśli nie ma jeszcze żadnych danych, widzi empty state z dwoma drogami wejścia: ręczne dodanie fiszki albo wygenerowanie ich przez AI, przy czym opcja AI ma być mocniej podkreślona.

Ścieżka ręczna wygląda następująco: użytkownik klika „Dodaj”, wypełnia przód i tył fiszki w modalu, zapisuje i wraca do odświeżonej listy. Z tej samej listy może też później wejść do edycji tej fiszki w analogicznym modalu lub usunąć ją po potwierdzeniu.

Ścieżka AI wygląda następująco: użytkownik otwiera modal generowania, wkleja tekst, generuje kandydatów, poprawia lub odrzuca wybrane pozycje i akceptuje listę. Po zapisie trafia na pierwszą stronę listy, przewiniętą do góry, gdzie widzi nowo dodane fiszki.

Ścieżka nauki rozpoczyna się z listy fiszek przyciskiem „Rozpocznij”. Użytkownik przechodzi przez kolejne fiszki w modalu, odwracając karty i przechodząc dalej zgodnie z kolejnością zestawu. Na końcu sesji widzi ekran zakończenia i wraca do listy.

### Ważne kryteria sukcesu i sposoby ich mierzenia
Na poziomie strategicznym przyjęto dwa orientacyjne cele sukcesu dla pilotażu:
1. 75% fiszek wygenerowanych przez AI ma być akceptowanych przez użytkownika.
2. 75% wszystkich tworzonych fiszek ma powstawać z wykorzystaniem AI.

Sposób pomiaru oparty będzie na dedykowanej tabeli logów generowania. Logi mają zawierać pełną listę pierwotnie wygenerowanych kandydatów, identyfikatory kart oraz dane umożliwiające późniejszą analizę jakości i skuteczności promptów. Jednocześnie nie planuje się wdrożenia osobnego systemu analitycznego. W PRD cele te powinny być ujęte jako orientacyjne, a nie jako szczegółowo rozpisany plan walidacji w MVP.

### Obszary ważne dla redakcji pełnego PRD
Pełny PRD powinien odzwierciedlać, że produkt jest świadomie minimalny, ale dopracowany w zakresie przepływów i walidacji. Duża część decyzji dotyczy szczegółów doświadczenia użytkownika: zachowania modali, paginacji, powrotów po akcjach, blokowania akceptacji błędnych kandydatów z AI, czyszczenia pól formularzy czy zachowania listy po operacjach CRUD. To oznacza, że dokument powinien mocno eksponować nie tylko funkcje, ale też konkretne reguły zachowania UI.

PRD powinien również wyraźnie odnotować przyjęte kompromisy: brak onboardingu, brak eksportu, brak regulaminu i polityki prywatności, brak moderacji wsadu, brak wsparcia użytkownika oraz odłożenie wyboru biblioteki do powtórek na późniejszy etap. Te elementy nie są błędami w planie, lecz świadomymi ograniczeniami MVP.

</prd_planning_summary>

<unresolved_issues>
1. Konkretna biblioteka open-source do obsługi powtórek nie została jeszcze wybrana i ma zostać określona później.
2. Szczegóły techniczne implementacji logów generowania, integracji z biblioteką powtórek i innych aspektów infrastrukturalnych zostały celowo wyłączone z obecnego zakresu PRD.
3. Cele sukcesu 75% są zachowane jako orientacyjne cele pilotażowe, ale bez zdefiniowanego planu pomiaru, harmonogramu badania ani kohorty użytkowników w samym PRD.
4. Nie ustalono jeszcze ostatecznego zakresu informacji prezentowanych po zakończeniu sesji nauki poza faktem wyświetlenia ekranu końcowego.
5. Rozważany komunikat ostrzegający, że ponowne generowanie usuwa obecną listę kandydatów AI, nie został ostatecznie zapisany jako wymaganie.
</unresolved_issues>
</conversation_summary>