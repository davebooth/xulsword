#!/usr/bin/perl
#usage UpdateModulesLocales.pl MK MKS MKO AllLocales IncludeLocales IncludeIndexes XSMversion MinProgversionForXSM includeBibles includeCommentaries includeGenBooks includeDevotionals includeLexDict

$MK = shift;
$MKS = shift;
$MKO = shift;

$AllLocales = shift;
$IncludeLocales = shift;
$IncludeIndexes = shift;
$XSMversion = shift;
$MinProgversionForXSM = shift;
$IncludeBibles = shift;
$IncludeCommentaries = shift;
$IncludeGenBooks = shift;
$IncludeDevotionals = shift;
$IncludeLexDict = shift;

$AllLocales =~ s/(^\s*|\"|\s*$)//g;
$IncludeLocales =~ s/(^\s*|\"|\s*$)//g;
$IncludeBibles =~ s/(^\s*|\"|\s*$)//g;
$IncludeCommentaries =~ s/(^\s*|\"|\s*$)//g;
$IncludeGenBooks =~ s/(^\s*|\"|\s*$)//g;
$IncludeDevotionals =~ s/(^\s*|\"|\s*$)//g;
$IncludeLexDict =~ s/(^\s*|\"|\s*$)//g;

@allLocales = split(/\s*,\s*/, $AllLocales);
@includeLocales = split(/\s*,\s*/, $IncludeLocales);
@includeBibles = split(/\s*,\s*/, $IncludeBibles);
@includeCommentaries = split(/\s*,\s*/, $IncludeCommentaries);
@includeGenBooks = split(/\s*,\s*/, $IncludeGenBooks);
@includeDevotionals = split(/\s*,\s*/, $IncludeDevotionals);
@includeLexDict = split(/\s*,\s*/, $IncludeLexDict);

# remove all but included locales
$hasEN = "false";
opendir(CHROME, "$MK/xulrunner/chrome");
@chromelist = readdir(CHROME);
close(CHROME);
  
foreach $entry (@chromelist) {
  if ($entry !~ /^(\w\w(-\w*)?)\.(locale\.manifest|jar|txt)$/) {next;}
  $locale = $1;
  if ($locale eq "en-US") {$hasEN = "true"; next;}
  $bk = "false";
  foreach $l (@includeLocales) {if ($locale eq $l) {$bk = "true"; last;}}
  if ($bk eq "true") {next;}
  if (-e "$MK\\xulrunner\\chrome\\$locale.jar") {`del /Q \"$MK\\xulrunner\\chrome\\$locale.*\"`;}
}
if ($hasEN eq "false") {`ren \"$MK\\xulrunner\\chrome\\en-US.locale.manifest\" \"en-US.nomenu.manifest\"`;}

# Delete existing modules from xulrunner dir
if (-e "$MK\\xulrunner\\mods.d") {`rmdir /S /Q \"$MK\\xulrunner\\mods.d\"`;}
if (-e "$MK\\xulrunner\\modules\\comments") {`rmdir /S /Q \"$MK\\xulrunner\\modules\\comments\"`;}
if (-e "$MK\\xulrunner\\modules\\genbook") {`rmdir /S /Q \"$MK\\xulrunner\\modules\\genbook\"`;}
if (-e "$MK\\xulrunner\\modules\\lexdict") {`rmdir /S /Q \"$MK\\xulrunner\\modules\\lexdict\"`;}
if (-e "$MK\\xulrunner\\modules\\texts") {`rmdir /S /Q \"$MK\\xulrunner\\modules\\texts\"`;}

# Copy selected modules to xulrunner dir
`mkdir \"$MK\\xulrunner\\mods.d\"`;
`mkdir \"$MK\\xulrunner\\modules\\comments\\zcom\"`;
`mkdir \"$MK\\xulrunner\\modules\\genbook\\rawgenbook\"`;
`mkdir \"$MK\\xulrunner\\modules\\lexdict\\rawld\"`;
`mkdir \"$MK\\xulrunner\\modules\\lexdict\\rawld\\devotionals\"`;
`mkdir \"$MK\\xulrunner\\modules\\texts\\ztext\"`;

# Add or change version info for modules
opendir(CONF, "$MKS/moduleDev/swordmk-mods/mods.d");
@confs = readdir(CONF);
close(CONF);
foreach $conf (@confs) {
  open(TMP, ">$MKS/moduleDev/swordmk-mods/tmp.conf");
  open(INC, "<$MKS/moduleDev/swordmk-mods/mods.d/$conf");
  $hasXSMversion = "false";
  $hasMinProgversionForXSM = "false";
  while(<INC>) {
    if ($_ =~ s/^\s*(xulswordVersion\s*=\s*).*$/$1$XSMversion/) {$hasXSMversion = "true";}
    if ($_ =~ s/^\s*(minMKVersion\s*=\s*).*$/$1$MinProgversionForXSM/) {$hasMinProgversionForXSM = "true"};
    print TMP $_;
  }
  close(INC);
  if ($hasXSMversion eq "false") {print TMP "\nxulswordVersion=$XSMversion\n";}
  if ($hasMinProgversionForXSM eq "false") {print TMP "minMKVersion=$MinProgversionForXSM\n";}
  close(TMP);
  unlink(INC);
  rename("$MKS/moduleDev/swordmk-mods/tmp.conf", "$MKS/moduleDev/swordmk-mods/mods.d/$conf");
}

if (-e "$MKS/installer/autogen/uninstall.iss") {unlink("$MKS/installer/autogen/uninstall.iss");}
if (@includeBibles) {processModuleGroup("texts\\ztext", \@includeBibles);}
if (@includeCommentaries) {processModuleGroup("comments\\zcom", \@includeCommentaries);}
if (@includeGenBooks) {processModuleGroup("genbook\\rawgenbook", \@includeGenBooks);}
if (@includeDevotionals) {processModuleGroup("lexdict\\rawld\\devotionals", \@includeDevotionals);}
if (@includeLexDict) {processModuleGroup("lexdict\\rawld", \@includeLexDict);}
if (-e "$MKS/installer") {
  if (!(-e "$MKS/installer/autogen")) {mkdir("$MKS/installer/autogen");}
  if (!(-e "$MKS/installer/autogen/uninstall.iss")) {
    open(INF, ">$MKS/installer/autogen/uninstall.iss");
    print INF "{no modules installed}\n";
    close(INF);
  }
}

sub processModuleGroup($@) {
  $path = shift;
  $listptr = shift;
  
  # Copy modules to installer location, handle indexes properly
  $log = "$MKS\\moduleDev\\swordmk-mods\\Out_EncryptTexts.txt";
  chdir("$MKS\\moduleDev\\swordmk-mods"); # so that mkfastmod will work!
  foreach $mod (@{$listptr}) {
    $modlc = lc($mod);
    if ($IncludeIndexes eq "true") {
      print "Creating search index in $path for $mod...\n";
      &logit("Creating search index in $path for $mod...\n");
      if (-e "$MKS\\moduleDev\\swordmk-mods\\modules\\$path\\$modlc\\lucene") {`rmdir /Q /S \"$MKS\\moduleDev\\swordmk-mods\\modules\\$path\\$modlc\\lucene\"`;}
      $mykey="";
      open(INF, "<$MKS\\moduleDev\\swordmk-mods\\keys.txt") || die "Could not open $MKS\\moduleDev\\swordmk-mods\\keys.txt\n";
      while(<INF>) {if ($_ =~ /^(.*):$mod$/) {$mykey = $1;}}
      close(INF);
      if ($mykey ne "") {&setCipher("$MKS\\moduleDev\\swordmk-mods\\mods.d\\$modlc.conf", $mykey);}
      `\"$MK\\Cpp\\swordMK\\utilities\\bin\\mkfastmod.exe\" $mod >> \"$log\"`;
      if ($mykey ne "") {&setCipher("$MKS\\moduleDev\\swordmk-mods\\mods.d\\$modlc.conf", "");}
    }
    `copy \"$MKS\\moduleDev\\swordmk-mods\\mods.d\\$modlc.conf\" \"$MK\\xulrunner\\mods.d\"`;
    `xcopy \"$MKS\\moduleDev\\swordmk-mods\\modules\\$path\\$modlc\" \"$MK\\xulrunner\\modules\\$path\\$modlc\" /S /Y /I`;

    if ($IncludeIndexes ne "true" && -e "$MK\\xulrunner\\modules\\$path\\$modlc\\lucene") {`rmdir /S /Q \"$MK\\xulrunner\\modules\\$path\\$modlc\\lucene\"`;}
  }
  
  if (-e "$MKS/installer") {
    if (!(-e "$MKS/installer/autogen")) {mkdir("$MKS/installer/autogen");}
    # Hack uninstaller file
    if (!(-e "$MKS/installer/autogen/uninstall.iss")) {
      open(OUTF, ">$MKS/installer/autogen/uninstall.iss") || die "Could not open autogen/uninstall.iss";
      print OUTF "if ResultCode = 0 then\n";
      print OUTF "begin\n";
      print OUTF "  CreateDir(ExpandConstant('{app}\\defaults'));\n";
      print OUTF "  CreateDir(ExpandConstant('{app}\\defaults\\pref'));\n";
      print OUTF "  SaveStringToFile(ExpandConstant('{app}\\defaults\\pref\\newInstalls.txt'), 'NewLocales;NewModules', False);\n";
      print OUTF "end\n";
      close(OUTF);
    }

    # Create new code
    $modlist="";
    $code="";
    foreach $mod (@{$listptr}) {
      $modlc = lc($mod);
      $code = $code."  DelTree(ExpandConstant('{app}\\modules\\".$path."\\".$modlc."'), True, True, True);\n";
      $code = $code."  DeleteFile(ExpandConstant('{app}\\mods.d\\".$modlc.".conf'));\n";
      $modlist = $modlist.";".$mod;
    }

    # Insert new code
    $new = "";
    open(INF, "<$MKS/installer/autogen/uninstall.iss") || die "Could not open autogen/uninstall.iss";
    while (<INF>) {
      if ($_ =~ /^(\s*SaveStringToFile.*?')([^']+)(', False\);$)/) { #'{
        $st = $1;
        $man = $2;
        $en = $3;
        $newlocales = join(";", @includeLocales);
        $man =~ s/(NewLocales.*)(;NewModules)/NewLocales;$newlocales$2/;
        $man = $man.$modlist;
        $_ = $st.$man.$en."\n".$code;
      }
      $new = $new.$_;
    }
    close(INF);
    open(OUTF, ">$MKS/installer/autogen/uninstall.iss") || die "Could not open autogen/uninstall.iss";
    print OUTF $new;
    close(OUTF);
  }
}

sub setCipher($$) {
  my $c = shift;
  my $k = shift;
  open(TMP, ">$MKS\\moduleDev\\swordmk-mods\\tmp.xml") || die "Could not open $MKS\\moduleDev\\swordmk-mods\\tmp.xml\n";
  open(CONF, "<$c") || die "Could not open $c\n";
  $haskey = "false";
  while(<CONF>) {
    if ($_ =~ s/^\s*CipherKey\s*=.*$/CipherKey=$k/) {$haskey = "true";}
    print TMP $_;
  }
  if ($haskey eq "false") {print TMP "CipherKey=$k\n";}
  close(CONF);
  close(TMP);
  unlink($c);
  rename ("$MKS\\moduleDev\\swordmk-mods\\tmp.xml", $c);
}

sub logit($) {
  my $l = shift;
  open(LOGF, ">>$log") || die "Could not open log file $log\n";
  print LOGF $l;
  close(LOGF);
}