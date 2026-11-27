var e=`# Bottar

En **bot** är en spelare som spelet spelar åt dig. I en lobby du är värd
för spelar bottar varje plats som ingen tar, så att du kan träna, eller
spela med färre vänner.

## Vem som spelar en bot

Ingen lägger till bottar: en lobby listar bara sina människor. När
[laglobbyn](modes.md#laglobby) är slut spelar varje sida den lagbuild den
valde, och varje karaktär i den som ingen tog spelas av en bot, under den
karaktärens namn. En sida som ingen är med på spelar ett slumpat förvalt
lag, bara bottar. Den som lämnar under laglobbyn lämnar sin karaktär till
en bot.

I lobbyn och laglobbyn ser en bot ut som vem som helst. I matchen är den
märkt **BOT** på sin namnskylt, målramen, gruppfönstret och
matchsammanfattningen.

Bottar skapas för en match: när den är slut listar lobbyn sina människor
igen, och nästa matchs bottar skapas på nytt.

## Hur bottar slåss

En bot spelar den roll dess build ger den. En som bär ett närstridsvapen
är **frontlinje**: den går nära och attackerar sitt mål. En med två eller
fler helningar eller skydd som den kan kasta på en allierad är en
**helare**: den står bakom den allierade som är mest skadad, borta från
fienderna. När två eller fler fiender fokuserar på en allierad lägger en
helare sitt skydd på den allierade innan träffen landar. Varje annan bot
är **avståndsstridande**: den håller sig där var och en av dess attacker
når, och står kvar och slåss mot en fiende som kommer för nära.
Avståndsstridande bottar och helare kliver dit där färre fiender kan nå
dem, och använder pelare som skydd. Ett lag vänder sig mot varje fiende
inom räckhåll som faller under 60 % hälsa, för att göra slut på hen. I
King of the Hill, medan ditt lag inte håller altaret, går det andra
lagets spökhjälte på altaret före till och med det. I ett lag av bottar
väntar en bot som kommer långt före sitt lag på resten innan den trycker
på vidare. Bottar i ditt lag stannar i stället hos dig: frontlinjen ett
steg före, avståndsstridande bredvid dig, helare bakom, och de följer med
dit du går. När du har stått overksam ett tag spelar de vidare som ett
lag av bottar skulle göra.
Medan du är aktiv går en bott som en strid har dragit långt bort från dig tillbaka till dig, om den inte är svårt skadad eller har en fiende alldeles intill sig.
En frontlinjebott vänder sig mot en fiende som anfaller lagets helare eller besvärjare, om den inte är på väg att göra slut på sitt eget mål.
En bott med en områdesbesvärjelse kastar den där tre eller fler fiender står samlade, om inte laget håller på att göra slut på en fiende eller följer ett utropat mål.
En bot med en förlamande eller saktande färdighet använder den på en fiende vid sin sida, eller på en som anfaller lagets helare eller besvärjare, före lagets mål.

Mot ett lag med områdesfärdigheter håller avståndsbottar och helare isär, så att en explosion inte träffar två av dem. De ger aldrig upp skydd för det.

En distansbott eller helare som en fiende kommer för nära drar sig först tillbaka till sin närmaste frontlinjebott, om någon är nära nog, och slåss där. En nedsaktad närstridare, till exempel lemlästad, hinner inte med, så mot den backar botten i stället undan mellan skotten.

Bågskyttar och spjutkastare tar höjden när det är säkert.
En bott som två fiender fokuserar på, eller som har under halva hälsan och tappar den snabbt, gömmer sig från deras syn i upp till tre sekunder: bakom en mur, under ett däck eller på höjden.
När ingen fiende är nära drar en bot i en spak som öppnar en kortare väg till fienderna. Två bottar river också en mur som döljer en mycket kortare väg, genom att slå på den med sina vapen.

Bottar som gör skada håller inne sina stora träffar, attackförmågor och
skadebesvärjelser, och avfyrar dem samtidigt mot lagets mål, så att
skadan landar på en gång i stället för att droppa in så att en helare
hinner göra den ogjord: den långsammaste besvärjelsen går först, en
snabbare så mycket senare som den är snabbare. Under tiden fortsätter de
att svinga och kasta sina förbannelser och åkommor. En bot väntar högst
fyra sekunder på sina lagkamrater, och väntar inte alls för att göra slut
på en fiende under 30 % hälsa. När målet står under en skyddande
förtrollning som Protective Spirit eller Aegis tar en bot med
förtrollningsborttagning, som Strip Enchantment, bort den först, och de
andra håller inne sina träffar för den.

En svårt skadad bot som håller på att förlora sin strid drar sig tillbaka
bakom sin helare, eller till sin bas, och vilar utom räckhåll tills den
har fått tillbaka det mesta av sin hälsa.

En bot återupplivar en fallen allierad bara när fienderna inte står över
kroppen, fler av dess eget lag än av deras står nära den, och aldrig
medan en fiende i närheten har boten själv som mål.

Bottar kliver undan ungefär hälften av de projektiler som riktas mot dem,
som en Fireball eller en attackförmågas pil, så att stanna eller vända
fungerar för dem som för dig.

Bottar går runt brinnande mark och andra skadliga områden när omvägen inte
är mycket längre, och kliver ut ur ett de står i.
De kliver också ut ur en motståndares skadliga område, som en brunn, ett skydd mot dem eller en storm, och slåss från dess kant.

En bot med ett avbrott sparar det till de kastningar som spelar roll: en
återupplivning eller en spökhjälte som tar altaret först, sedan en
helning eller ett skydd, en elitförmåga, eller en stor
träff som en attackförmåga eller en skadebesvärjelse. Allt annat, och ett
vanligt vapenslag, släpper den igenom. Precis som en spelare missar den
ungefär en av fyra av de kastningarna.

En bot tar ett mänskligt ögonblick, en bråkdel av en sekund, på sig att
reagera på det som händer, så ett snabbt avbrott eller en sen undanmanöver
kan slå den.

När ingen i ditt lag har utpekat ett mål, pekar en av dina bottar ut
fienden som dina bottar går på, precis som du skulle göra: du ser
markören och bottens namn, så att du kan hänga på. Ett mål som en bott
pekar ut visar bara vart bottarna är på väg; de skyddar ändå en
lagkamrat och gör slut på en döende fiende. Ett mål du pekar ut vinner
alltid: alla bottar i laget går på ditt mål, ingen bott ersätter det,
och bottarna pekar ut igen först när målet är dött eller borta.

I en strid mellan tre lag slåss bottar mot ett fiendelag i
taget: laget som attackerar dem, eller, medan ingen gör det, det mest
skadade laget inom räckhåll. De stannar på det laget tills ett annat
sätter tydligt fler spelare på dem, och anfaller inte ett nytt lag medan
ett annat attackerar dem. Ett mål som deras lag utpekat kommer först,
vilket lag det än tillhör. Bara spelare räknas: ett lags spöke eller
vakter som står i närheten får inte bottarna att vända sig mot det laget.

## Slumparena

En slumparena har inga bottar: varje plats är en riktig spelare, och du
väntar tills tillräckligt många står i kö.
`;export{e as default};
//# sourceMappingURL=bots-ChneNu1y.js.map