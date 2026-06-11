[Version]
Class=IEXPRESS
SEDVersion=3
[Options]
PackagePurpose=InstallApp
ShowInstallProgramWindow=0
HideExtractAnimation=0
UseLongFileName=1
InsideCompressed=0
CAB_FixedSize=0
CAB_ResvCodeSigning=0
RebootMode=N
InstallPrompt=%InstallPrompt%
DisplayLicense=%DisplayLicense%
FinishMessage=%FinishMessage%
TargetName=%TargetName%
FriendlyName=%FriendlyName%
AppLaunched=%AppLaunched%
PostInstallCmd=%PostInstallCmd%
AdminQuialifiedName=%AdminQuialifiedName%
SourceFiles=SourceFiles
[Strings]
InstallPrompt=Install Kanban Office (ARM64) to your user folder?
DisplayLicense=
FinishMessage=Kanban Office installed. A desktop shortcut was created.
TargetName=C:\Users\ronni\Documents\dev\pm-floor\dist\KanbanOffice-Setup-arm64.exe
FriendlyName=Kanban Office Setup (ARM64)
AppLaunched=cmd /c install.cmd
PostInstallCmd=<None>
AdminQuialifiedName=
FILE0="app.zip"
FILE1="install.cmd"
[SourceFiles]
SourceFiles0=C:\Users\ronni\Documents\dev\pm-floor\installer-build
[SourceFiles0]
%FILE0%=
%FILE1%=
