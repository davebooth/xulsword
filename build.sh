#!/bin/bash

# This script can be run on any linux, OSX or vagrant machine. It
# installs any necessary dependencies and builds xulsword using the
# loc_MK.txt build settings if this file exists (otherwise defaults).

cd `dirname $0`

EXTRAS=IBTXulsword

if [ $(uname | grep Darwin) ]; then
  echo Running on OSX
  brew update
  brew install wget
  brew install autoconf
  brew install automake
  brew install subversion
  brew install libtool
else
  echo Running on Linux
  sudo apt-get update
  sudo apt-get install -y libtool
  sudo apt-get install -y autoconf
  sudo apt-get install -y make
  sudo apt-get install -y pkg-config
  sudo apt-get install -y build-essential
  sudo apt-get install -y subversion
  sudo apt-get install -y git
  sudo apt-get install -y zip
  sudo apt-get install -y firefox
fi

# If this is Vagrant, then copy xulsword code locally so as not to 
# disturb any build files on the host machine!
if [ -e /vagrant ]; then
  if [ -e /home/vagrant/xulsword ]; then
    rm -rf /home/vagrant/xulsword
  fi
  mkdir /home/vagrant/xulsword
  
  cd /vagrant
  stash=`git stash create`
  if [ ! $stash ]; then stash=`git rev-parse HEAD`; fi
  git archive -o archive.zip $stash
  mv archive.zip /home/vagrant/xulsword
  cd /home/vagrant/xulsword
  unzip archive.zip
  rm archive.zip
fi
XULSWORD=`pwd -P`

echo XULSWORD path is "$XULSWORD"

# XULSWORD_HOST is xulsword on the non-virtual machine (may have custom
# control files etc.)
if [ -e /vagrant ]; then
  XULSWORD_HOST=/vagrant
else
  XULSWORD_HOST=$XULSWORD
fi

cd $XULSWORD
find . -name "*.pl" -exec chmod ugo+x {} \;
find . -name "*.sh" -exec chmod ugo+x {} \;

# COMPILE SWORD ENGINE DEPENDENCIES
# CLucene
if [ ! -e $XULSWORD/Cpp/clucene-core-0.9.21b ]; then
  echo Compiling $XULSWORD/Cpp/clucene-core-0.9.21b
  cd $XULSWORD/Cpp
  wget http://sourceforge.net/projects/clucene/files/clucene-core-stable/0.9.21b/clucene-core-0.9.21b.tar.bz2/download
  tar -xf download 
  rm download

  cd $XULSWORD/Cpp/clucene-core-0.9.21b
  # Patch a problem with MAC compile of clucene
  if [ $(uname | grep Darwin) ]; then
    cp -f ../cluceneMK/osx/repl_tchar.h ./src/CLucene/config
  fi
  make clean
  ./configure --disable-multithreading
  make
  sudo make install
  sudo ldconfig
fi

: <<'COMMENT'
cd $XULSWORD/Cpp
# Compile XZ Utils
if [ ! -e ./xz-5.0.5 ]; then
	wget http://tukaani.org/xz/xz-5.0.5.tar.bz2
	tar -xf xz-5.0.5.tar.bz2 
	rm xz-5.0.5.tar.bz2
fi
cd xz-5.0.5
make clean
./configure
make
sudo make install
sudo ldconfig

# Compile bzip2
cd $XULSWORD/Cpp
if [ ! -e ./clucene-core-0.9.21b ]; then
	wget http://www.bzip.org/1.0.6/bzip2-1.0.6.tar.gz
	tar -xf bzip2-1.0.6.tar.gz 
	rm bzip2-1.0.6.tar.gz
fi
cd bzip2-1.0.6
make clean
make
sudo make install
sudo ldconfig
COMMENT

# Compile the SWORD engine (at specific rev)
swordRev=3203
if [ ! -e $XULSWORD/Cpp/sword-svn ]; then
  cd $XULSWORD/Cpp
  svn checkout -r $swordRev http://crosswire.org/svn/sword/trunk sword-svn
  cd sword-svn
  # fix a SWORD bug
  perl -p -i -e 's/(PKG_CHECK_MODULES\(\[CLUCENE2\], \[libclucene\-core >= 2.3\],,true\))/\#$1/' ./configure.ac
  if [ $(uname | grep Darwin) ]; then
    # use brew's glibtoolize instead of libtoolize
    perl -p -i -e 's/^(LTIZE="\$AUTODIR"")(libtoolize")/$1g$2/' ./autogen.sh
  fi
  ./autogen.sh
  ./configure --without-icu --without-xz --without-bzip2
  make
  sudo make install
  sudo ldconfig
fi

# Download xulrunner (unless it exists already)
xulrunnerRev=41.0b9
if [ ! -e $XULSWORD/xulrunner ]; then
  cd $XULSWORD
  if [ $(uname | grep Darwin) ]; then
    xulrunner=xulrunner-$xulrunnerRev.en-US.mac.tar.bz2
  else
    if [[ "$(uname -m)" == *"i686"* ]]; then
      xulrunner=xulrunner-$xulrunnerRev.en-US.linux-i686.tar.bz2
    else
      xulrunner=xulrunner-$xulrunnerRev.en-US.linux-x86_64.tar.bz2
    fi
  fi
  wget http://ftp.mozilla.org/pub/mozilla.org/xulrunner/releases/$xulrunnerRev/runtimes/$xulrunner
  tar -xf $xulrunner
  rm $xulrunner
fi

# Configure xulsword
cd $XULSWORD/Cpp
make clean
if [ $(uname | grep Darwin) ]; then
  # patch untgz MAC compile problem
  perl -p -i -e 's/#ifdef unix/#if defined(unix) || defined(__APPLE__)/g' ./sword-svn/src/utilfuns/zlib/untgz.c
fi
./autogen.sh
./configure

if [ ! -e $XULSWORD/sword ]; then
  mkdir $XULSWORD/sword
fi

# Link to EXTRAS if available
if [ -e "$XULSWORD_HOST/$EXTRAS" -a ! -e "$XULSWORD/$EXTRAS" ]; then
  sudo ln -s "$XULSWORD_HOST/$EXTRAS" "$XULSWORD/$EXTRAS"
fi

# Start with a clean build-out if we're virtual
if [ -e /vagrant ]; then
  `rm -rf "$XULSWORD/build-out"`
fi

# Build and compile xulsword
if [ -e $XULSWORD/$EXTRAS/loc_MK.txt ]; then
  $XULSWORD/$EXTRAS/build_MK.sh
	$XULSWORD/build/build.pl $XULSWORD/$EXTRAS/loc_MK.txt
else 
	$XULSWORD/build/build.pl
fi

# Copy virtual build-out to host if we're running virtual
if [ -e /vagrant ]; then
  `cp -r "$XULSWORD/build-out" /vagrant`
  # Fix permissions in Vagrant
  chown -R vagrant:vagrant /home/vagrant
fi
