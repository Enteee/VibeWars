# Ranking

## What is ranked

Every queued match with no bots in it is ranked: Random Arena and Team
Arena. A Hosted Game, Training and any match with a bot in it are
unranked. There is no switch for it and no separate queue. A ranked
match never fills an empty seat with a bot.

## Your rating

Your rating belongs to your player key, the one this browser keeps.
Every character you play on it shares that one rating.

Ranked queues pair players of similar rating, and split them into teams
with similar average ratings. The search starts within 100 points of
your rating and widens by 10 points for every second you wait, up to
600, so nobody waits forever. While you wait, the queue shows your
rating.

Your first 10 rated matches are provisional: the queue says
**Provisional (3/10 matches)** and you have no rank yet. After that the
main menu shows your rank. Ratings decay: each day without a rated
match makes yours less certain, and the leaderboard ranks by a cautious
value, so if you stop playing your rank sinks within weeks.

Once the ladder has 20 established players, a ranked match counts only
when at least one player in it is established (10 or more rated
matches): a match between new players alone is unrated. Play someone
established and your matches count.

The **Leaderboard** button in the top bar lists the top 100 by rank,
name and rating, your own row highlighted.

Hero rank (★) is not this rating: it comes from fame, see
[Heroes' Ascent](modes.md#heroes-ascent).

## Starting the match

When a ranked match is found, everyone confirms it within 15 seconds,
and the screen says **Confirming ranked match…**. If anyone does not,
the match is cancelled and everyone goes back to the queue.

## Ending the match

At the end, everyone signs the result within 30 seconds. Not signing
counts as leaving, and leaving a ranked match counts as a loss, the
host's too. The leave button says so. A result counts only when more
than half the seats signed it.

## What is published

The match's receipt goes to public Nostr relays. It holds each
player's public key and character name (a player with no character is
named as a starter), and who played whom. Anyone can read it, and it
cannot be taken back. Unranked matches publish nothing.

## When it updates

Your rating moves within the hour, and the leaderboard with it.
