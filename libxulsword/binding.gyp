{
  "targets": [
    {
      "target_name": "libxulsword",
      "sources": [ "src/libxulsword.cpp" ],
      "libraries": ["$(XULSWORD)/Cpp/build/libxulsword-static.so.1.4.4"],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")",
        "$(XULSWORD)/Cpp/src/include",
        "$(XULSWORD)/Cpp/sword/include"
      ],
      'defines': [ 'NODE_GYP_MODULE_NAME=libxulsword' ],
      'cflags!': [ '-fno-exceptions' ],
      'cflags_cc!': [ '-fno-exceptions' ],
      'conditions': [
        ["OS=='win'", {
            "defines": [
                "_HAS_EXCEPTIONS=1"
            ],
            "msvs_settings": {
                "VCCLCompilerTool": {
                    "ExceptionHandling": 1
                },
            },
        }],
        ["OS=='mac'", {
            'xcode_settings': {
            'GCC_ENABLE_CPP_EXCEPTIONS': 'YES',
            'CLANG_CXX_LIBRARY': 'libc++',
            'MACOSX_DEPLOYMENT_TARGET': '10.7',
            },
        }],
    ]
    }
  ],
  'variables' : {
    'openssl_fips': ''
  },

}
