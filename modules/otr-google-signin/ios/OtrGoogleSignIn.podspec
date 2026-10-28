Pod::Spec.new do |s|
  s.name = 'OtrGoogleSignIn'
  s.version = '1.0.0'
  s.summary = 'OTR nonce binding for the official Google Sign-In SDK'
  s.license = { :type => 'MIT' }
  s.author = 'OTR Mobile'
  s.homepage = 'https://github.com/xoery83/OTR-mobile'
  s.platforms = { :ios => '16.4' }
  s.swift_version = '5.9'
  s.source = { :git => 'https://github.com/xoery83/OTR-mobile.git', :tag => 'otr-google-signin-1.0.0' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.dependency 'GoogleSignIn', '9.2.0'
  s.source_files = '**/*.swift'
end
