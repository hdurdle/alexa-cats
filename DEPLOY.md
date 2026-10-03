# Setting up the cat flap skill: step by step

This guide gets the skill running on your own computer so you can ask your
Echo things like:

> "Alexa, ask cat flap where are the cats?"
> "Alexa, ask cat flap who's been out the longest?"
> "Alexa, ask cat flap how are the batteries?"

You don't need to know anything about programming or servers. Follow the
steps in order. It takes about 30–45 minutes, mostly waiting for downloads.
Everything used here is free.

If you're comfortable with Docker and command lines, the shorter
[README](README.md) may suit you better.

## What you need

- **SureFlap cat flaps or pet doors** that you already control with the
  Sure Petcare app (a Microchip Cat Flap Connect or Pet Door Connect, with
  its hub).
- **A computer that stays switched on**, running Windows 10 or 11, or a
  Mac. The skill runs on this computer, so it only works while the computer
  is on. An old laptop that you leave plugged in is fine.
- **Your Sure Petcare email address and password**: the ones you use in the
  Sure Petcare app.
- **The Amazon account your Echo uses.**
- **An email address** for a free ngrok account (step 3).

## How it fits together

```
Your Echo  ->  Amazon  ->  ngrok (gives your computer a web address)
           ->  your computer (runs the skill)  ->  Sure Petcare
```

- **Docker Desktop** runs the skill on your computer, in a tidy box that
  doesn't change anything else on it.
- **ngrok** gives the skill a secure web address, so Amazon can reach it
  without you changing your router.
- **An Amazon developer account** holds your own private copy of the skill.
  Only you can use it.

---

## Step 1: Install Docker Desktop

### On Windows

1. Go to <https://www.docker.com/products/docker-desktop/> and click
   **Download for Windows**.
2. Open the downloaded file (it's called something like
   `Docker Desktop Installer.exe`) and click **Yes** if Windows asks for
   permission.
3. When the installer shows options, leave them as they are (keep **Use WSL 2**
   ticked) and click **OK**. When it finishes, click **Close and restart**.
4. After your computer restarts, Docker Desktop opens by itself. Accept the
   agreement. If it asks you to sign in, you can click **Skip** or
   **Continue without signing in**. If it says it needs to update WSL, click
   the button it offers and wait.
5. Click the **gear icon** (Settings) at the top. On the **General** page, tick
   **Start Docker Desktop when you sign in to your computer**, then click
   **Apply**.

### On a Mac

1. Click the **Apple menu** (top left) and choose **About This Mac**. Note
   whether it says **Apple M1/M2/M3/M4** (Apple chip) or **Intel**.
2. Go to <https://www.docker.com/products/docker-desktop/>, click **Download
   for Mac**, and pick the version for your chip.
3. Open the downloaded `Docker.dmg` and drag the whale icon into
   **Applications**.
4. Open **Docker** from your Applications folder. Click **Open** if your Mac
   asks whether you're sure, and enter your Mac password if asked. Accept the
   agreement. If it asks you to sign in, you can skip it.
5. Click the **gear icon** (Settings). On the **General** page, tick **Start
   Docker Desktop when you sign in to your computer**, then click **Apply**.

**Check it's working:** Docker Desktop's window should show **Engine running**
at the bottom left.

### Keep the computer awake

The skill only answers while the computer is on and awake.

- **Windows:** open **Settings → System → Power** (or **Power & battery**) and
  set **When plugged in, put my device to sleep after** to **Never**.
- **Mac:** open **System Settings → Battery** (or **Energy**) and turn on
  **Prevent automatic sleeping when the display is off** (on a laptop, under
  **Options…**).

## Step 2: Download the skill

1. Go to <https://github.com/hdurdle/alexa-cats>.
2. Click the green **Code** button, then **Download ZIP**.
3. Find the downloaded `alexa-cats-master.zip` (usually in **Downloads**).
   - **Windows:** right-click it, choose **Extract All…**, and extract it into
     your **Documents** folder.
   - **Mac:** double-click it, then drag the `alexa-cats-master` folder into
     your **Documents** folder.
4. You now have a folder called `alexa-cats-master` in Documents. This is
   where your settings will be saved, so keep it.

## Step 3: Get a free ngrok account

ngrok gives the skill a fixed, secure web address.

1. Go to <https://dashboard.ngrok.com/signup> and sign up for a free account.
2. You'll need two things from the ngrok website. Keep the page open, because
   the setup in step 5 asks for them:
   - **Your authtoken.** In the menu on the left, click **Your Authtoken**
     (sometimes under **Getting Started**). It's a long string of letters and
     numbers; there's a **Copy** button next to it.
   - **Your free domain.** In the menu, click **Domains**. If no domain is
     listed, click **New Domain** (or **Create Domain**) to get your free one.
     It looks like `something-something.ngrok-free.app`.

## Step 4: Get a free Amazon developer account

This is where your private copy of the skill lives.

1. Go to <https://developer.amazon.com/> and click **Sign in**.
2. **Sign in with the same Amazon account your Echo uses.** This matters: the
   skill only appears on Echos linked to this account.
3. If asked, fill in the short developer profile (your name and country are
   enough) and accept the agreement.

That's all; the setup does the rest.

## Step 5: Run the setup

1. Make sure Docker Desktop is open and says **Engine running**.
2. Open the `alexa-cats-master` folder in Documents.
3. Start the setup:
   - **Windows:** double-click **`setup.cmd`**. If a blue box says _Windows
     protected your PC_, click **More info**, then **Run anyway**.
   - **Mac:** double-click **`setup.command`**. If your Mac says it can't be
     opened because it's from an unidentified developer, open **System
     Settings → Privacy & Security**, scroll down, click **Open Anyway** next
     to `setup.command`, then confirm. If Terminal asks for access to your
     Documents folder, click **Allow**.
4. A window with text opens. The first time, it spends a few minutes preparing;
   that's normal. Then it asks you some questions:

   | It asks                    | What to do                                                                                                                                                              |
   | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | Sure Petcare email address | Type it and press **Enter**.                                                                                                                                            |
   | Sure Petcare password      | Type it and press **Enter**. Nothing shows as you type; that's on purpose.                                                                                              |
   | Which household            | Only appears if your account has more than one. Type its number.                                                                                                        |
   | Which pets to include      | Press **Enter** to include them all, or type the numbers of any to leave out (for example `3 5`).                                                                       |
   | Room behind each cat flap  | Press **Enter** to just call it "inside", or type a room name like `kitchen`.                                                                                           |
   | Nicknames                  | Press **Enter**. (You only need nicknames if Alexa doesn't understand a name later.)                                                                                    |
   | ngrok authtoken            | Copy it from the ngrok website (step 3), then paste it: on Windows right-click in the window, on a Mac press **⌘V**. Press **Enter**. Nothing shows; that's on purpose. |
   | ngrok domain               | Paste or type your domain (like `something.ngrok-free.app`) and press **Enter**.                                                                                        |

5. Next it signs you in to Amazon:
   - It shows a long web link. Copy it (on Windows select it with the mouse,
     then right-click; on a Mac select it and press **⌘C**), paste it into
     your web browser, and sign in with the **same Amazon account** as in
     step 4.
   - Click **Allow**. The page shows a code. Copy it, go back to the setup
     window, paste it, and press **Enter**.
   - If it asks **"Do you want to link your AWS account…"**, type `n` and
     press **Enter**.
6. Finally it asks for a **name for your skill** (press **Enter** for "My Cat
   Flap") and **which English your Echo uses**. Press **Enter** for UK English,
   or type the number for another.
7. It creates your skill and waits while Amazon builds it, which takes a minute
   or two. When it says **All done**, close the window.

## Step 6: Try it

Say to your Echo:

> "Alexa, ask cat flap where are the cats?"

Other things to try:

| Say                                               | It tells you                                       |
| ------------------------------------------------- | -------------------------------------------------- |
| "Alexa, ask cat flap where is Tilly?"             | Where one cat is, and for how long                 |
| "Alexa, ask cat flap who is outside?"             | Which cats are out                                 |
| "Alexa, ask cat flap who's been out the longest?" | The cat that's been out longest                    |
| "Alexa, ask cat flap how old is Tilly?"           | Her age (if Sure Petcare knows her birthday)       |
| "Alexa, ask cat flap to keep Tilly in"            | Sets her curfew so she can't go out                |
| "Alexa, ask cat flap to let Tilly out"            | Lets her out again                                 |
| "Alexa, ask cat flap to lock the cat flaps"       | Locks all flaps both ways (it asks you to confirm) |
| "Alexa, ask cat flap to unlock"                   | Unlocks all flaps                                  |
| "Alexa, ask cat flap how are the batteries?"      | Which flaps need new batteries                     |

You can also see the skill in the **Alexa app**: tap **More → Skills & Games**,
scroll to the bottom, tap **Your Skills**, then the **Dev** tab.

---

## Day to day

There's nothing to do. As long as the computer is on and Docker Desktop is
running, the skill keeps working, including after a restart.

## When things change

**You added or removed a cat, added a cat flap, or changed your Sure Petcare
password:** open the `alexa-cats-master` folder and double-click
**`update.cmd`** (Windows) or **`update.command`** (Mac). It re-reads your
pets and flaps, asks about anything new, and updates your skill. If you
changed your password, it asks for the new one.

**Alexa doesn't understand a cat's name:** occasionally Alexa won't recognise
a particular name. Give the cat a nickname it does recognise: double-click
**update**, and when it lists your pets, type the cat's number and then the
nickname (for example `Fluffy`). Now "where is Fluffy" answers about that cat,
and Alexa still says the cat's real name.

**A new version of the skill comes out:**

1. Download and extract the ZIP again (step 2), into a new folder.
2. Copy these from your old folder into the new one: `config.json`, `.env`
   and the `.ask` folder. On a Mac, press **⌘ Shift .** in Finder to see files
   whose names start with a dot. On Windows, in File Explorer choose **View →
   Show → Hidden items**.
3. Double-click **update** in the new folder. You can then delete the old
   folder.

## If something goes wrong

| What happens                                                         | What to do                                                                                                                                                                                                        |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The setup says _Docker Desktop isn't running_                        | Open Docker Desktop, wait for **Engine running**, and double-click setup again.                                                                                                                                   |
| _That email or password wasn't accepted_                             | Check them by signing in to the Sure Petcare app, then try again.                                                                                                                                                 |
| Alexa says _There was a problem with the requested skill's response_ | Open Docker Desktop and click **Containers**. Both **alexa-cats** and **tunnel** should be running (green). If one has stopped, click its **▶** button. If it keeps stopping, click it and read the **Logs** tab. |
| The **tunnel** logs mention `authtoken` or `domain`                  | The ngrok details don't match. Double-click setup again, answer `n` when asked to keep the public address, and paste them again.                                                                                  |
| Alexa says _I'm not sure_ or opens a different skill                 | Another skill may also be called "cat flap". In the Alexa app, disable the other one.                                                                                                                             |
| Alexa keeps asking _Which cat do you mean?_                          | See _Alexa doesn't understand a cat's name_ above.                                                                                                                                                                |
| On a Mac, double-clicking does nothing or says _permission denied_   | Open **Terminal** (in Applications → Utilities), type `sh ` (with a space), drag `setup.command` into the window, and press **Enter**.                                                                            |
| Anything else                                                        | Open an issue at <https://github.com/hdurdle/alexa-cats/issues> with what you did and what the window said. **Don't include your passwords or the contents of `config.json` or `.env`.**                          |

## Removing it

1. In Docker Desktop, click **Containers**, then the bin icon next to
   **alexa-cats**.
2. Go to <https://developer.amazon.com/alexa/console/ask>, find your skill,
   and choose **Delete** from its **Actions** menu.
3. Delete the `alexa-cats-master` folder.
4. If you no longer want them, uninstall Docker Desktop and close your ngrok
   account.

## Privacy

- Your Sure Petcare password is stored only in `config.json` on your
  computer, so the skill can sign in by itself. Don't share that file, or
  `.env` (your ngrok key), or the `.ask` folder (your Amazon developer
  sign-in).
- Requests from Alexa reach your computer through ngrok. They include your
  cats' names and where they are. Amazon and ngrok handle them as part of
  their services.
- The skill talks to Sure Petcare the same way their app does. It is
  unofficial and not made by Sure Petcare, so it could stop working if they
  change their service.
