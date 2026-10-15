@echo off
:: Batch script to add Windows Firewall rule for Samsung TV Web Remote (Port 3000)
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Requesting Administrator privileges to allow Port 3000 in Windows Firewall...
    powershell -Command "Start-Process cmd -ArgumentList '/c netsh advfirewall firewall add rule name=\"Samsung TV Web Remote\" dir=in action=allow protocol=TCP localport=3000 & pause' -Verb RunAs"
    exit /b
)

echo Adding Windows Firewall rule for Port 3000...
netsh advfirewall firewall add rule name="Samsung TV Web Remote" dir=in action=allow protocol=TCP localport=3000
echo.
echo Done! Port 3000 is now accessible to other devices on your Wi-Fi.
pause
