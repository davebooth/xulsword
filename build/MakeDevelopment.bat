echo off
cd "%MK%\build"

if not defined MKAppinfo Set MKAppinfo=%MK%\build
call "%MKAppinfo%\Appinfo.bat"
cd "%MK%\build"

if exist "%MK%\xulrunner\xulrunner-stub.exe" call "%MK%\build\scriptNoRun\FirstRun.bat"

ECHO --- COPY XULRUNNER FILES
del /Q "%MK%\xulrunner\*.exe"
xcopy "%MK%\xul\xulrunnerDevAndProd\xulrunner" "%MK%\xulrunner" /S /Y
rename "%MK%\xulrunner\xulrunner-stub.exe" "%executable%"

ECHO --- COPY XUL DEVELOPMENT ONLY FILES
copy /Y "%MK%\xul\xulrunnerDevelopment\chrome\*" "%MK%\xulrunner\chrome"
del "%MK%\xulrunner\chrome\en-US.nomenu.manifest"
call "%MK%\build\scriptNoRun\UpdateJars.pl" "%MK%" "%MKS%" "%MKO%" false %UIversion% %MinProgversionForUI% %IncludeLocales% %AllLocales%

copy /Y "%MK%\xul\xulrunnerDevelopment\debug\venkmanOverlay.xul" "%MK%\xul\xulsword"
copy /Y "%MK%\xul\xulrunnerDevelopment\debug\venkman-service.js" "%MK%\xulrunner\components\"
copy /Y "%MK%\xul\xulrunnerDevelopment\debug\venkman.jar" "%MK%\xulrunner\chrome\"
copy /Y "%MK%\xul\xulrunnerDevelopment\debug\venkman.manifest" "%MK%\xulrunner\chrome\"
copy /Y "%MK%\xul\xulrunnerDevelopment\debug\debug.js" "%MK%\xulrunner\defaults\pref\"

call "%MK%\build\scriptNoRun\Update.bat"

pause

