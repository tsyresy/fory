import pexpect
import sys

def check_profile(profile):
    child = pexpect.spawn('npx eas credentials', encoding='utf-8')
    # child.logfile = sys.stdout
    
    child.expect('Select platform')
    child.sendline('\r')
    
    child.expect('Which build profile')
    # Use arrow keys to select the profile
    if profile == 'preview':
        child.send('\x1b[B')
    elif profile == 'production':
        child.send('\x1b[B\x1b[B')
    child.sendline('\r')
    
    child.expect('What do you want to do')
    
    # Dump the buffer to see if "Push Notifications (FCM V1)" says "Key ...json" or "None assigned yet"
    print(f"--- Output for {profile} ---")
    print(child.before)
    
    child.sendline('Exit')
    
    child.close()

check_profile('preview')
check_profile('production')
