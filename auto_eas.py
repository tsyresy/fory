import pexpect
import sys

def run_eas():
    child = pexpect.spawn('npx eas credentials', encoding='utf-8')
    child.logfile = sys.stdout
    
    child.expect('Select platform')
    child.sendline('\r')
    
    child.expect('Which build profile')
    child.sendline('\r')
    
    child.expect('What do you want to do')
    # Select Google Service Account
    child.send('\x1b[B')
    child.sendline('\r')
    
    # We want: "Manage your Google Service Account Key for Push Notifications (FCM V1)"
    # It is the SECOND option.
    child.expect('What do you want to do')
    child.send('\x1b[B')
    child.sendline('\r')
    
    child.expect('What do you want to do')
    # Options:
    # Set up a Google Service Account Key for Push Notifications (FCM V1)
    child.sendline('\r')
    
    child.expect('Would you like to use this file')
    child.sendline('y')
    
    child.expect(pexpect.EOF)

run_eas()
