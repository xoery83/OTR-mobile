Pod::Spec.new do |s|
  s.name = 'PlaceSearch'
  s.version = '1.0.0'
  s.summary = 'Transient Apple MapKit search adapter for OTR Mobile'
  s.license = { :type => 'MIT' }
  s.author = 'OTR Mobile'
  s.homepage = 'https://github.com/xoery83/OTR-mobile'
  s.platforms = { :ios => '16.4' }
  s.swift_version = '5.9'
  s.source = { :git => 'https://github.com/xoery83/OTR-mobile.git', :tag => 'place-search-1.0.0' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'MapKit'
  s.source_files = '**/*.swift'
end
