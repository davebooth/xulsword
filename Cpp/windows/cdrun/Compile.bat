@ECHO USAGE: Compile.bat

@echo off
cd %~dp0
call ..\..\windows\Versions.bat

if exist .\Release rmdir /S /Q .\Release
mkdir .\Release

Set cFlags=/nologo /MT /EHsc /W0^
 /I "%MK%\Cpp\src\include"^
 /D USE_STL /D NDEBUG /D _UNICODE /D UNICODE /D _CRT_SECURE_NO_DEPRECATE /Fo".\Release\\" /c

Set cFiles=^
 "%MK%\Cpp\windows\cdrun\w32process.cpp"^
 "%MK%\Cpp\windows\cdrun\cdrun.cpp"

Set lFlags=/OUT:".\Release\cdrun.exe" /INCREMENTAL:NO /NOLOGO^
 /MANIFEST /MANIFESTFILE:".\Release\cdrun.exe.intermediate.manifest"^
 /SUBSYSTEM:WINDOWS Advapi32.lib User32.lib

Set lFiles=^
 ".\Release\w32process.obj"^
 ".\Release\cdrun.obj"
:: ".\Release\CDRunApp.res" icon cannot be added with WindowsSDK7 due to a bug in cvtres.exe

echo on
::rc.exe /l 0x409 /fo".\Release\CDRunApp.res" ".\CDRunApp.rc"
cl.exe %cFlags% %cFiles%
link.exe %lFlags% %lFiles%
mt.exe -manifest "Release\cdrun.exe.intermediate.manifest" -outputresource:".\Release\cdrun.exe";1
@echo off

echo.
if exist ".\Release\cdrun.exe" (echo ----------- cdrun.exe SUCCESS!) else (echo ----------- cdrun.exe COMPILE FAILED...)
echo.
