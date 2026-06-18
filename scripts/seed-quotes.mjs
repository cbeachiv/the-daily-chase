// Seeds the user's quote collection from Chase's existing list.
// Idempotent: deterministic IDs (date + text hash) so re-running overwrites
// rather than duplicating. Run with:  npm run seed:quotes
import { existsSync, readFileSync } from "node:fs";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function credential() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (projectId && clientEmail && privateKey) return { projectId, clientEmail, privateKey };
  if (existsSync("serviceAccount.json")) {
    const j = JSON.parse(readFileSync("serviceAccount.json", "utf8"));
    return { projectId: j.project_id, clientEmail: j.client_email, privateKey: j.private_key };
  }
  console.error("No credentials.");
  process.exit(1);
}
if (!getApps().length) initializeApp({ credential: cert(credential()) });
const db = getFirestore();
const auth = getAuth();

function iso(d) {
  const [m, dd, yy] = d.split("/").map(Number);
  return `20${String(yy).padStart(2, "0")}-${String(m).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}
function hash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

const QUOTES = [
  { d: "6/5/26", a: `Wilfred Peterson`, t: `In great attempts it is glorious even to fail` },
  { d: "5/31/26", a: `Goethe`, t: `Talent is built in the call but character is built in the storm` },
  { d: "5/20/26", a: `William Hacking`, t: `It's better to wear out than to rust out` },
  { d: "5/3/26", a: `Fyodor Dostoyevsky`, t: `Your worst sin is that you have destroyed and betrayed yourself for nothing` },
  { d: "4/9/26", a: `Miyamoto Musashi`, t: `It's better to be a warrior in a garden than a gardener in a war` },
  { d: "1/18/26", a: `Krishnamurti`, t: `It is only those who are in constant revolt that discover what is true, not the man who conforms, who follows some tradition.` },
  { d: "1/17/26", a: `Randolph Churchill`, t: `Fathers always expect their sons to have their virtues without their faults.` },
  { d: "1/17/26", a: `Denzel Washington`, t: `At your highest moment, be careful. That's when the devil comes for you.` },
  { d: "1/12/26", a: `Kika Macfarlane`, t: `To carry forward my inner child this year` },
  { d: "12/27/25", a: `Maya Angelou`, t: `Courage is the most important of all the virtues because without courage, you can't practice any other virtue consistently.` },
  { d: "12/25/25", a: `Winston Churchill`, t: `To be able to make your work your pleasure is the one class distinction in the world worth striving for` },
  { d: "11/26/25", a: `Thomas Jefferson`, t: `If my neighbor believes in 20 gods or no gods at all it neither picks my pocket or breaks my leg` },
  { d: "10/17/25", a: `Virgil Abloh`, t: `Work on as many projects at once to reach the highest potential` },
  { d: "10/17/25", a: `CS Lewis`, t: `The true road lies in quite another direction` },
  { d: "9/27/25", a: `PT Barnum`, t: `Without promotion something terrible happens, nothing!` },
  { d: "9/25/25", a: `Mark Twain`, t: `The secret to getting ahead is getting started` },
  { d: "9/8/25", a: `Alan Jacobs`, t: `Do you want to read? Or do you just want to have read?` },
  { d: "8/26/25", a: `Umberto Eco`, t: `Read books are far less valuable than unread ones. The library should contain as much of what you do not know. You will accumulate more knowledge and more books as you grow older, and the growing number of unread books on the shelves will look at you menacingly. Indeed, the more you know, the larger the rows of unread books. Let us call this collection of unread books an antilibrary.` },
  { d: "8/13/25", a: `Anthony de Mello`, t: `To a disciple who was forever complaining about others, the Master said, 'If it is peace you want, seek to change yourself, not other people. It is easier to protect your feet with slippers than to carpet the whole of the earth.'` },
  { d: "7/29/25", a: `Ciaran Power`, t: `If you live within your means anything is possible` },
  { d: "6/30/25", a: `Anthony de Mello`, t: `If you were not actively engaged in making yourself missable you would be happy` },
  { d: "6/7/25", a: `Umberto Eco`, t: `When someone sees my book collection and asks 'have you read all these books' I reply with 'these are the books I need to read by the end of the month, the rest are in my office'` },
  { d: "5/9/25", a: `Theodore Roosevelt`, t: `Life is a great adventure... accept it in such a nature.` },
  { d: "4/27/25", a: `Pablo Picasso`, t: `To know what you are going to draw, you have to begin drawing.` },
  { d: "4/1/25", a: `William Faulkner`, t: `Read, read, read. Read everything — trash, classics, good and bad, and see how they do it. Just like a carpenter who works as an apprentice and studies the master. Read! You'll absorb it. Then write. If it's good, you'll find out. If it's not, throw it out of the window.` },
  { d: "3/7/25", a: `Jonas Salk`, t: `Hope lies in dreams, in imagination and in the courage of those who date to make dreams into reality` },
  { d: "3/2/25", a: `Elon Musk`, t: `Reality is an irony maximizer. The most ironic and entertaining outcome is most likely` },
  { d: "2/16/25", a: `Anthony De Mello`, t: `How can you come to possess this kind of love? You cannot, because it is already there within you. All you have to do is remove the blocks you place to sensitivity and it would surface.` },
  { d: "2/4/25", a: `Marcus Aurelius`, t: `In human life seek justice, truth, temperance and courage, and you will profit from the supreme good that you have discovered.` },
  { d: "2/1/25", a: `Tim Ferriss`, t: `A person's success in life can usually be measured by the number of uncomfortable conversations he or she is willing to have.` },
  { d: "1/15/25", a: `Daniel Akst`, t: `Self employment, for me at least, is a never-ending contest between the world's worst manager and the world's laziest employee.` },
  { d: "1/10/25", a: `Jerry Seinfeld`, t: `Learning something new involves relatively brief spurts of progress, each of which is followed by a slight decline to a plateau somewhat higher than what preceded it. You must be willing to spend most of your time practicing on a plateau even when you seem to be getting nowhere.` },
  { d: "12/14/24", a: `Charlie Munger`, t: `Most books I don't read past the first chapter. I'm not burdened by bad books. You need two things to get a lot out of reading: Lots of inputs and a strong filter.` },
  { d: "12/7/24", a: `Alan Watts, "The Wisdom of Insecurity" (33)`, t: `If, then, we are to be fully human and fully alive and aware, it seems that we must be willing to suffer for our pleasures. Without such willingness there can be no growth in the intensity of consciousness` },
  { d: "12/7/24", a: `Cicero`, t: `For who is there who, shooting all day, will not sometimes hit the mark?` },
  { d: "12/6/24", a: `Viktor Frankl`, t: `Between stimulus and response, there is a space. That space there is a power to choose a response, in our response lies our growth and freedom` },
  { d: "10/16/24", a: `Lao Tzu`, t: `A good traveler has no fixed plans and is not intent on arriving.` },
  { d: "10/15/24", a: `Jordan Peterson`, t: `Learning to see a challenge as an opportunity is the beginning of wisdom` },
  { d: "9/29/24", a: `Christopher Sommer`, t: `In fact, this impatience in dealing with frustration is the primary reason that most people fail to achieve their goals. Unreasonable expectations timewise, resulting in unnecessary frustration, due to a perceived feeling of failure. Achieving the extraordinary is not a linear process. The secret is to show up, do the work, and go home. A blue collar work ethic married to indomitable will. It is literally that simple. Nothing interferes. Nothing can sway you from your purpose.

Once the decision is made, simply refuse to budge. Refuse to compromise. And accept that quality long-term results require quality long-term focus. No emotion. No drama. No beating yourself up over small bumps in the road. Learn to enjoy and appreciate the process. This is especially important because you are going to spend far more time on the actual journey than with those all too brief moments of triumph at the end.` },
  { d: "9/20/24", a: `Bertrand Russell`, t: `The best life is the one in which the creative impulses play the largest part and the possessive impulses the smallest.` },
  { d: "8/18/24", a: `Brian Halligan`, t: `For a long time, I looked for consensus. I think consensus is really the enemy of scale, and so I used to say, "Whenever we're making an important decision, there should be winners in the room and losers. We shouldn't find that negotiated settlement that everyone is happy with. Somebody should be unhappy, three or four people should walk out unhappy, and one should walk out happy, and we're all going to be good with it." As you get bigger, the gravity pulls you towards consensus, and I think consensus is the enemy of greatness.` },
  { d: "8/10/24", a: `Ralph Waldo Emerson`, t: `Finish each day and be done with it. You have done what you could. Some blunders and absurdities no doubt crept in; forget them as soon as you can. Tomorrow is a new day; begin it well and serenely and with too high a spirit to be cumbered with your old nonsense.` },
  { d: "7/28/24", a: `Roger Federer`, t: `Whatever game you choose, give it your best, go for your shots, play free, try everything` },
  { d: "7/25/24", a: `Tom McGuane`, t: `How do you know what's enough until you've found out what's too much?` },
  { d: "7/22/24", a: `Christopher Morley`, t: `There is only one success—to be able to spend your life in your own way.` },
  { d: "7/21/24", a: `Voltaire`, t: `Doubt is not a pleasant condition, but certainty is absurd` },
  { d: "7/19/24", a: `Tim O'Reilly`, t: `Money is like gasoline during a road trip. You don't want to run out of gas on your trip, but you're not doing a tour of gas stations.` },
  { d: "7/15/24", a: `Carl Jung`, t: `One does not become enlightened by imagining figures of light, but by making the darkness conscious` },
  { d: "7/7/24", a: `Dumbledore, Harry Potter and the Goblet of Fire`, t: `Curiosity is not a sin. But we should exercise caution with our curiosity.` },
  { d: "7/6/24", a: `Rumi`, t: `Sell your cleverness and buy bewilderment. Cleverness is mere opinion, bewilderment is intuition.` },
  { d: "7/4/24", a: `Mary Kay Ash`, t: `It's so simple, yet makes such a difference. Pretend that every single person you meet has a sign around his or her neck that says, 'Make me feel important.'` },
  { d: "7/4/24", a: `Mortimer Adler, How to Read a Book`, t: `Think of these levels as reading to entertain, reading to inform, reading to understand, and reading to master. When you learned to read in elementary school, you were taught to read for entertainment. If you made it to high school and college, you learned to read to inform. This is where most people stop. But most of the value comes at the last two levels.` },
  { d: "6/28/24", a: `Oscar Wilde`, t: `A work of art is the unique result of a unique temperament. Its beauty comes from the fact that the author is what he is. It has nothing to do with the fact that other people want what they want. Indeed, the moment that an artist takes notice of what other people want, and tries to supply the demand, he ceases to be an artist, and becomes a dull or an amusing craftsman, an honest or a dishonest tradesman. He has no further claim to be considered as an artist.` },
  { d: "6/13/24", a: `George Orwell`, t: `The most fundamental mistake of man is that he thinks he knows what's going on. Nobody knows what's going on.` },
  { d: "6/9/24", a: `Richard Feynman`, t: `Fall in love with some activity, and do it! Nobody ever figures out what life is all about, and it doesn't matter. Explore the world. Nearly everything is really interesting if you go into it deeply enough. Work as hard and as much as you want to on the things you like to do the best. Don't think about what you want to be, but what you want to do.` },
  { d: "6/9/24", a: `William James`, t: `Most people live, whether physically, intellectually or morally, in a very restricted circle of their potential being. They make use of a very small portion of their possible consciousness, and of their soul's resources in general, much like a man who, out of his whole bodily organism, should get into a habit of using and moving only his little finger. Great emergencies and crises show us how much greater our vital resources are than we had supposed.` },
  { d: "6/2/24", a: `Cillian Murphy`, t: `My life is very simple. I read a lot of books. I watch a lot of movies. Listen to a lot of music. Walk the dog. Cook. Be with my family.` },
  { d: "5/26/24", a: `Lauren Wilford`, t: `big secret to happiness is just liking stuff. finding more stuff to like. finding ways to like stuff you didn't before` },
  { d: "5/18/24", a: `Dumbledore, Harry Potter and the Chamber of Secrets`, t: `It is our choices, Harry, that show what we truly are, far more than our abilities.` },
  { d: "4/27/24", a: `Jensen Huang`, t: `People with very high expectations have very low resilience, and resilience matters in success` },
  { d: "4/22/24", a: `Hans Zimmer`, t: `Life isn't as long as you think it is. You have a choice: You can go and try to live a playful life, or you can go and live a life which excludes playfulness. And it doesn't get you anywhere. Playfulness gets you somewhere.` },
  { d: "4/21/24", a: `John Ortberg`, t: `At this point in my life, I'm just trying not to miss the goodness of each day and bring my best self to it.` },
  { d: "4/15/24", a: `Douglas Hofstadter`, t: `Thinking is all about the ability to look at complex situations and strip away things that don't count—the ability to filter out situations and find what's at their core.` },
  { d: "4/5/24", a: `Friedrich Nietzsche`, t: `I know of no better life purpose than to perish in attempting the great and the impossible. Where would the courage and greatness be if success was certain and there was no risk? The only true failure is shrinking away from life's challenges.` },
  { d: "3/24/24", a: `Brad Jacobs`, t: `The single most powerful thing you can do in a relationship, whether it's personal or professional, is to give someone 100% of your attention.` },
  { d: "3/16/24", a: `Isabella Rossellini`, t: `I just play. I'm playful. And I became increasingly more playful with age.` },
  { d: "2/26/24", a: `James Dyson`, t: `You are just as likely to solve a problem by being unconventional and determined as by being brilliant.` },
  { d: "2/11/24", a: `Anthony Bourdain`, t: `I always entertain the notion that I'm wrong, or that I'll have to revise my opinion. Most of the time that feels good; sometimes it really hurts and is embarrassing.` },
  { d: "2/3/24", a: `Anthony de Mello`, t: `Most people end up being conformists; they adapt to prison life. A few become reformers; they fight for better lighting, better ventilation. Hardly anyone becomes a rebel, a revolutionary who breaks down the prison walls. You can only be a revolutionary when you see the prison walls in the first place.` },
  { d: "1/26/24", a: `Siddhartha`, t: `He always seems to be only playing at business` },
  { d: "1/15/24", a: `Shane Parrish`, t: `Ninety percent of success can be boiled down to consistently doing the obvious thing for an uncommonly long period of time without convincing yourself that you're smarter than you are.` },
  { d: "1/13/24", a: `Will Durant`, t: `Health lies in action, and so it graces youth. To be busy is the secret of grace, and half the secret of content. Let us ask the gods not for possessions, but for things to do; happiness is in making things rather than in consuming them.` },
  { d: "1/9/23", a: `Carl Jung`, t: `The world will ask you who you are, and if you don't know, the world will tell you.` },
  { d: "1/5/24", a: `Charles Mingus`, t: `Making the complicated simple, awesomely simple, that's creativity` },
  { d: "12/31/23", a: ``, t: `Before I set my foot on the stage for the first time each night, or when a camera is about to roll on an important scene, I will say to myself, out loud but very, very softly, "I don't give a damn." Of course I do give a damn; I give a desperate damn. But I don't let that hinder me. If anything, I let it liberate me.` },
  { d: "12/30/23", a: `Ethics of Spinoza`, t: `But everything great is just a difficult to realize as it is rare to find` },
  { d: "12/25/23", a: `Publius Syrus`, t: `Awareness, not age, leads to wisdom.` },
  { d: "12/16/23", a: `Jack Welch`, t: `I don't have any special competence that would enable me to answer that question` },
  { d: "12/15/23", a: `Fred Kofman`, t: `A leader who does not confront broken commitments encourages polite complacency.` },
  { d: "12/15/23", a: `Michelle Rozek`, t: `Secure attachments are NOT formed as a result of preventing relational ruptures. Secure attachments are formed as a result of repairing ruptures.` },
  { d: "12/9/23", a: `Dr. César A. Cruz`, t: `Art should comfort the disturbed and disturb the comfortable.` },
  { d: "12/3/23", a: `Charlie Munger`, t: `I think a life properly lived is just learn, learn, learn all the time.` },
  { d: "11/24/23", a: `Noah Purifoy (LA Hammer Museum)`, t: `Creativity can be an act of living, a way of life, and a formula for doing the right thing.` },
  { d: "11/13/23", a: `Jim Rohn`, t: `You cannot change your destination overnight, but you can change your direction overnight.` },
  { d: "11/7/23", a: `Buddhist saying`, t: `Tension is who you think you should be. Relaxation is who you are` },
  { d: "10/21/23", a: `Stephen Nachmanovitch`, t: `The easiest way to do art is to dispense with success and failure altogether and just get on with it.` },
  { d: "10/10/23", a: `Seneca`, t: `I shall never be ashamed of citing a bad author if the line is good` },
  { d: "10/6/23", a: ``, t: `Play silly games win silly prizes` },
  { d: "10/5/23", a: `Benjamin Franklin`, t: `If you want something done, ask a busy person.` },
  { d: "10/1/23", a: `Shane Parrish`, t: `The courage to start.
The discipline to focus.
The confidence to figure it out.
The patience to know progress is not always visible.
The persistence to keep going, even on the bad days.` },
  { d: "10/1/23", a: `Francis Crick`, t: `The secret to winning is very simple. My secret had been I know what to ignore.` },
  { d: "9/25/23", a: ``, t: `Think of your mind like a pond full of fish and each fish is a feeling. Try to be the pond, not the fish.` },
  { d: "9/17/23", a: `Lyn Alden`, t: `Humans tend to think linearly while debt compounds exponentially` },
  { d: "9/8/23", a: `Suzuki Shōsan`, t: `To learn to be always in a state of meditation means never to let your vital energy wane. You would never allow it to do so if it were certain that you were to die tomorrow. It wanes because you forget about death. Grit your teeth, fix your gaze, and observe death at this moment. You have to feel it so strongly that it seems as if it's attacking you. Fearless energy comes from this. At this moment, death is right before your eyes. It's not something you can afford to neglect.` },
  { d: "9/5/23", a: `Lyn Alden`, t: `Own utility, buy luxury` },
  { d: "9/2/23", a: `Dhruv Mehta`, t: `Ambition is to dream big. Courage is to start small` },
  { d: "8/28/23", a: `Carl Jung`, t: `Everything that irritates us about others can lead us to an understanding of ourselves.` },
  { d: "8/14/23", a: `Carl Jung`, t: `What did you do as a child that made the hours pass like minutes? Herein lies the key to your earthly pursuits.` },
  { d: "8/5/23", a: `Tim O'Reilly`, t: `Money is like gasoline during a road trip. You don't want to run out of gas on your trip, but you're not doing a tour of gas stations.` },
  { d: "7/17/23", a: `If — Rudyard Kipling`, t: `If you can make one heap of all your winnings
    And risk it on one turn of pitch-and-toss,
And lose, and start again at your beginnings
    And never breathe a word about your loss;` },
  { d: "7/12/23", a: `Dale Carnegie`, t: `Two men looked out from prison bars,
One saw the mud, the other saw the stars` },
  { d: "6/28/23", a: `Estée Lauder`, t: `Risk taking is the cornerstone of empires. No one ever became a success without taking chances.` },
  { d: "6/17/23", a: `Mandy Brown`, t: `But if there's anything I know about practicing it's that it isn't about rules or consistency or scarcity or god forbid optimizing: it's about coming back. A practice is built on the movement of return` },
  { d: "6/10/23", a: `Howard Aiken`, t: `Don't worry about people stealing your ideas. If your ideas are any good, you'll have to ram them down people's throats.` },
  { d: "6/4/23", a: `Thomas Keller`, t: `Having a dream is hard, living it is harder` },
  { d: "6/4/23", a: `Gustave Flaubert`, t: `Be regular and orderly in your life so that you may be violent and original in your work.` },
  { d: "5/2/23", a: `Jessica Hische`, t: `The work you do when you're procrastinating is probably the work you should be doing for the rest of your life.` },
  { d: "1/27/23", a: `E.B. White (Charlotte's Web)`, t: `There's no limit to how complicated things can get on account of one thing always leads to another` },
  { d: "1/24/23", a: `Paul Graham`, t: `The way to get new ideas is to notice anomalies: what seems strange, or missing, or broken? You can see anomalies in everyday life (much of standup comedy is based on this), but the best place to look for them is at the frontiers of knowledge. Knowledge grows fractally. From a distance its edges look smooth, but when you learn enough to get close to one, you'll notice it's full of gaps. These gaps will seem obvious; it will seem inexplicable that no one has tried x or wondered about y. In the best case, exploring such gaps yields whole new fractal buds.` },
  { d: "1/3/23", a: `Delmore Schwartz, "Calmly We Walk through This April's Day"`, t: `Time is the school in which we learn, time is the fire in which we burn.` },
  { d: "11/5/22", a: `Thomas Freese`, t: `The questions you ask are more important than the things you could ever say` },
  { d: "10/14/22", a: `Paul Graham`, t: `Action produces information` },
  { d: "9/9/22", a: `Louis L'Amour`, t: `There will come a time when you believe everything is finished. That will be the beginning.` },
  { d: "6/16/22", a: ``, t: `To family, sometimes it's shelter from the storm, sometimes it's the storm itself` },
  { d: "6/7/22", a: `Oscar Wilde`, t: `The Truth Is Rarely Pure and Never Simple.` },
  { d: "6/7/22", a: `Joe Coulomb on The Guns of August by Barbara Tuchman (Becoming Trader Joe page 14)`, t: `If you adopt a reasonable strategy, as opposed to waiting for an optimum strategy, and stick with it, you'll probably succeed. Tenacity is as important as brilliance. The germans and French both had brilliant general staffs, but neither side had the tenacity to stick with their prewar plans. As a result, the first ninety days of war ended in four years of bloody stalemate` },
  { d: "5/19/22", a: `Mackenzie Burnett`, t: `Create the opportunities you want to pursue` },
  { d: "5/6/22", a: `Joe Coulomb`, t: `Most of my career has been spent selling plans of action and programs of collaboration. If you want to know what separates me from most managers, that's it. From the beginning, thanks to Ortega y Gasset, I've been aware of the need to sell everyone.` },
  { d: "5/6/22", a: `General George Patton`, t: `The greatest danger is not that your enemy learns your plans, it's that your own troops don't` },
  { d: "4/27/22", a: `Rosabeth Moss Cantor`, t: `The middle of every successful project looks like a disaster` },
  { d: "4/27/22", a: `Ovid`, t: `Luck affects everything. Let you hook always be in cast; in the stream where you least expect it will be a fish` },
  { d: "4/25/22", a: `Cymbeline: Lachimo, Act 1 Scene 6`, t: `Boldness be my friend: Arm me audacity from head to foot` },
  { d: "4/24/22", a: `Chinese proverb`, t: `The faintest ink is more powerful than the strongest memory.` },
  { d: "4/23/22", a: `Christian Bobin`, t: `I was peeling a red apple from the garden when I suddenly understood that life would only ever give me a series of wonderfully insoluble problems. With that thought an ocean of profound peace entered my heart` },
  { d: "4/23/22", a: `Martin Heidegger`, t: `We don't get or have time at all - that instead we are time` },
  { d: "4/23/22", a: `Rainer Maria Rilke, Letters to a Young Poet`, t: `Patience means sitting with the work even when - especially when - nothing appears to be happening.` },
  { d: "4/21/22", a: `Yoruba proverb`, t: `Only the thing for which you have struggles will last` },
  { d: "4/18/22", a: `Sam Keen`, t: `The more you become a connoisseur of gratitude, the less you are a victim of resentment, depression, and despair. Gratitude will act as an elixir that will gradually dissolve the hard shell of your ego-your need to posses and control-and transform you into a generous being.` },
  { d: "3/29/22", a: `William Shakespeare`, t: `Uneasy lies the head that wears a crown` },
  { d: "3/26/22", a: `Dr. Seuss`, t: `Why fit in when you were born to stand out?` },
  { d: "3/26/22", a: `Ralph Waldo Emerson`, t: `Nothing great can be accomplished without enthusiasm` },
  { d: "3/16/22", a: `Theodore Roosevelt`, t: `The credit belongs to the man who is actually in the arena, whose face is marred by dust and sweat and blood; who strives valiantly; who errs, who comes short again and again, because there is no effort without error and shortcoming; but who does actually strive to do the deeds; who knows the great enthusiasms, the great devotions; who spends himself in a worthy cause; who at the best knows in the end the triumph of high achievement, and who at the worst, if he fails, at least fails while daring greatly, so that his place shall never be with those cold and timid souls who neither know victory nor defeat.` },
  { d: "3/12/22", a: ``, t: `Success has many fathers and failure has none` },
  { d: "3/12/22", a: `Rainer Maria Rilke`, t: `Avoid providing material for the drama that is always stretched tight between parents and children; it uses up much of the children's strength and wastes the love of the elders, which acts and warms even if it doesn't comprehend. Don't ask for any advice from them and don't expect any understanding; but believe in a love that is being stored up for you like an inheritance, and have faith that in this love there is a strength and a blessing so large that you can travel as far as you wish without having to step outside it.` },
  { d: "2/10/22", a: `Phil Knight`, t: `The cowards never started, and the weak died along the way. That leaves us` },
  { d: "2/10/22", a: `Phil Knight`, t: `Business is war without bullets` },
  { d: "2/9/22", a: `James Kunen`, t: `Time doesn't fly, it just never stops` },
  { d: "2/3/22", a: `Benjamin Franklin`, t: `To apply myself industriously to whatever business I take in hand, and not divert my mind from my business by any foolish project of suddenly growing rich; for industry and patience are the surest means of plenty.` },
  { d: "2/3/22", a: `Albert Einstein`, t: `It's not that I'm so smart, it's just that I stay with the problems longer.` },
  { d: "1/28/22", a: `Lao-Tsu`, t: `He who knows man is clever; he who knows himself has insight; he who conquers men has force; he who conquers himself is truly strong` },
  { d: "1/24/22", a: `Confucius`, t: `Men's nature are alike; it is their habits that carry them far apart` },
  { d: "1/24/22", a: ``, t: `Longtime working, stay in school, longtime married, stay single. Longtime dead, stay alive` },
  { d: "1/24/22", a: `CT`, t: `Enthusiasm breeds enthusiasm` },
  { d: "1/5/22", a: `Otto Von Bismarck`, t: `Fools learn from experience. I prefer to learn from the experience of others.` },
  { d: "1/5/22", a: `George S. Patton Jr.`, t: `Don't tell people how to do things, tell them what to do and let them surprise you with their results.` },
  { d: "1/5/22", a: `Dr. Daniel Siegel`, t: `To name it is to tame it.` },
  { d: "10/16/11", a: `Mike Gongas`, t: `When all the dust settles, and the vinegar is separated from the oil, you will be on top` },
];

async function main() {
  const list = await auth.listUsers(2);
  if (!list.users.length) {
    console.error("No Firebase Auth user found.");
    process.exit(1);
  }
  const uid = list.users[0].uid;
  console.log(`Seeding ${QUOTES.length} quotes for`, list.users[0].email);

  const N = QUOTES.length;
  let batch = db.batch();
  let ops = 0;
  for (let i = 0; i < QUOTES.length; i++) {
    const q = QUOTES[i];
    const date = iso(q.d);
    const id = `q_${date}_${hash(q.t)}`;
    // Earlier-listed quotes get a larger createdAt so they sort first within a day.
    const createdAt = new Date(Date.UTC(2000, 0, 1) + (N - i) * 1000).toISOString();
    batch.set(db.doc(`users/${uid}/quotes/${id}`), {
      text: q.t,
      author: q.a,
      date,
      createdAt,
    });
    if (++ops >= 400) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }
  if (ops > 0) await batch.commit();
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
