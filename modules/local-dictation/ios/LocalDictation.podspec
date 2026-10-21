Pod::Spec.new do |s|
  s.name             = 'LocalDictation'
  s.version          = '1.0.0'
  s.summary          = 'Explicit on-device short dictation for OTR Mobile'
  s.license          = { :type => 'MIT' }
  s.author           = 'OTR Mobile'
  s.homepage         = 'https://github.com/xoery83/OTR-mobile'
  s.platforms        = { :ios => '16.4' }
  s.swift_version    = '5.9'
  s.source           = { :git => 'https://github.com/xoery83/OTR-mobile.git', :tag => 'local-dictation-1.0.0' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks       = 'Speech', 'AVFoundation', 'UIKit'
  s.source_files     = '**/*.swift'
end
